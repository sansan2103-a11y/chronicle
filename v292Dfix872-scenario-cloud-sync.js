/* v292Dfix872-scenario-cloud-sync.js
 * ★★SCENARIO_CLOUD_SYNC_V1（sp8 / lane 12）
 *   Scenario の原本を **cloud（D1 `scenario` 表・worker v43.0-scenario）と同期する唯一の module**。
 *
 *   ── 状態: IMPLEMENTATION_STOP_OWNER ──
 *   OWNER_DECISION_SP8_v2 の 6 点が承認されるまで **本番で有効化しない**。
 *   この file を配っても、既定では 1 バイトも通信しない（下記 gate を参照）。
 *
 *   ── 有効化 gate（3 段・既定 OFF）──
 *     1. kill      : localStorage['v292Dfix872Off'] === '1'  → 何があっても止まる（kill が最優先）
 *     2. 明示 ON   : localStorage['v292Dfix872On']  === '1'  → **これが無い限り走らない**
 *     3. worker    : worker が v43 であること（GET / の scenarioSupported === 1）。
 *                    v42 以前は key 自体が無い＝「無い＝非対応」と読んで fail-closed（fix871 と同じ作法）。
 *   ★Owner 承認前の canary 手順: Owner が自分の端末で 2 を立てる → 数日観察 → 既定 ON は別 release。
 *
 *   ── revision 2 層（GPT 裁定 #SP8）──
 *     scenarioRev … fix820 META の `rev`。Scenario 内容の版。Story `origin.scenarioRev` と同じ意味。
 *                   **この module は scenarioRev を採番しない**（採番するのは fix820.create/edit だけ）。
 *     cloudRev    … D1 `scenario.rev`。CAS 専用で **server が権威**。client 値で seed しない。
 *                   端末間の新旧比較に使ってよいのは cloudRev **だけ**。
 *
 *   ── 同期規則（裁定 #SP8 line 3 の 4 分岐 + 端点）──
 *     remote.cloudRev == local.cloudRev && !dirty → no-op
 *     remote.cloudRev == local.cloudRev &&  dirty → push（putscenario expectedRev = local.cloudRev）
 *     remote.cloudRev >  local.cloudRev && !dirty → pull（getscenario → f872ApplyRemote）
 *     remote.cloudRev >  local.cloudRev &&  dirty → **CONFLICT**（自動上書きしない。UI で 2 択）
 *     remote 無し（local only）                   → push（expectedRev = 0）
 *     local tombstone && dirty                    → deletescenario（expectedRev = local.cloudRev）
 *     remote.deleted && local live && !dirty      → local body を消して META を墓標に（f872ApplyRemoteDelete）
 *     remote.deleted && local live &&  dirty      → ★**CONFLICT**（R10 解消。黙って消さない）
 *     remote.cloudRev <  local.cloudRev           → **何もしない**（ダウングレード禁止）
 *     local 無し / remote live                    → pull（新規取り込み）
 *   ★自動 merge なし・force overwrite なし（承認事項 ④）。利用者の選択肢は
 *     「クラウド版を使う」「新しい ID として保存」の 2 つだけ。
 *
 *   ── transport ──
 *     fix697 と **同じ** proxyUrl() / authHeaders() の作法（POST <proxy>/save・JSON）。
 *     ★ただし story session header（x-chronicle-story-session）は **付けない**。
 *       Scenario は account authority のみで、Story Passcode とは独立だから（承認事項 ⑥）。
 *     ★新しいカスタムヘッダは 1 本も増やさない（CORS allowlist を触らないため）。
 *
 *   ── localStorage への書込 ──
 *     この module が自分で書く key は **1 つも無い**。Scenario の永続化はすべて fix820 の
 *     f872* bridge を経由する（受理面 whitelist / rollback 規約を二重に持たないため）。
 */
(function(){
  'use strict';
  if (window.__v292Dfix872) return;
  var TAG = '[v292Dfix872:scenario-cloud-sync]';
  var VERSION = 'v292Dfix872-20260919-sync-v1.0';
  var TIMEOUT_MS = 20000;

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function killed(){ return lsg('v292Dfix872Off') === '1'; }
  function enabled(){ return !killed() && lsg('v292Dfix872On') === '1'; }
  function ST(){ return window.__v292Dfix820 || null; }

  /* ================= transport（fix697 と同一の作法・story session header は付けない） ================= */
  function proxyUrl(){
    try {
      var u = (lsg('v292ProxyUrl') || '').replace(/\s+/g,'');
      if (u) return u.replace(/\/+$/, '');
      if (window.__v292Dfix247bapi && window.__v292Dfix247bapi.DEFAULT_PROXY_URL) return window.__v292Dfix247bapi.DEFAULT_PROXY_URL;
    } catch(e){}
    return 'https://novel-proxy.sansan2103.workers.dev';
  }
  /* fix697 と同じ契約: helper がある page は helper だけ（fail closed）、無い page だけ read-only fallback。 */
  function googleTokenFromLS(){
    try {
      var j = JSON.parse(lsg('v292GoogleToken') || 'null');
      if (j && j.token && j.exp && (j.exp * 1000) > (Date.now() + 30000)) return String(j.token);
    } catch(e){}
    return '';
  }
  function authHeaders(){
    var h = { 'Content-Type': 'application/json' };
    var g = '';
    if (typeof window.__chronicleGoogleId === 'function'){
      try { g = window.__chronicleGoogleId() || ''; } catch(e){ g = ''; }
    } else {
      g = googleTokenFromLS();
    }
    if (g) h['x-google-id'] = g;
    try { var p = (lsg('v292ProxyPass') || '').replace(/^\s+|\s+$/g,''); if (p) h['x-chronicle-pass'] = p; } catch(e){}
    try {
      var s = '';
      if (typeof window.__chronicleSessionId === 'function'){ try { s = window.__chronicleSessionId() || ''; } catch(e){ s = ''; } }
      else if (lsg('v292Dfix837Off') !== '1'){
        var o = JSON.parse(lsg('v292Dfix837_sess') || 'null');
        if (o && o.sid && o.ts && (Date.now() - o.ts) < 604800000) s = o.sid;
      }
      if (s) h['x-chronicle-session'] = s;
    } catch(e){}
    /* ★x-chronicle-story-session は **付けない**（STORY_PASSCODE_SCOPE = STORY_ONLY）。 */
    return h;
  }
  function isLoggedIn(){ var h = authHeaders(); return !!(h['x-google-id'] || h['x-chronicle-pass'] || h['x-chronicle-session']); }

  function post(body, cb){
    if (!enabled()){ cb(null, 'OFF'); return; }
    if (!isLoggedIn()){ cb(null, 'NOT_LOGGED_IN'); return; }
    var ac = null, timer = null;
    try { ac = new AbortController(); timer = setTimeout(function(){ try { ac.abort(); } catch(e){} }, TIMEOUT_MS); } catch(e){}
    var opts = { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) };
    if (ac) opts.signal = ac.signal;
    try {
      window.fetch(proxyUrl() + '/save', opts).then(function(res){
        return res.json().then(function(j){ return { status: res.status, j: j }; },
                               function(){ return { status: res.status, j: null }; });
      }).then(function(r){
        if (timer) clearTimeout(timer);
        cb({ status: r.status, j: r.j || {} }, null);
      })['catch'](function(){ if (timer) clearTimeout(timer); cb(null, 'NETWORK_FAILED'); });
    } catch(e){ if (timer) clearTimeout(timer); cb(null, 'NETWORK_FAILED'); }
  }

  /* ================= capability gate（worker v43 であること） ================= */
  var CAP = { checked: false, supported: false };
  function checkCapability(cb){
    if (CAP.checked){ cb(CAP.supported); return; }
    if (!enabled()){ cb(false); return; }
    try {
      window.fetch(proxyUrl() + '/', { method: 'GET' }).then(function(res){ return res.json(); })
        .then(function(j){ CAP.checked = true; CAP.supported = !!(j && j.scenarioSupported === 1); cb(CAP.supported); })
        ['catch'](function(){ CAP.checked = true; CAP.supported = false; cb(false); });
    } catch(e){ CAP.checked = true; CAP.supported = false; cb(false); }
  }

  /* ================= CLIENT_CANONICAL_PROJECTION_V1 =================
     ★worker の chrCanonicalScenarioContent と **同じ値**を作る唯一の規則。
       入力は fix820.validate() が返した value（= 受理面を通った内容）。
       parity は storypass_worker_v43_acceptance_v1.mjs の W-17 群が 24 fixture で固定する。
     ★別 serializer を作らない（fix719/fix697 で学んだ「serializer が 2 本あると永久に一致しない」）。 */
  function stableStringify(v){
    if (v === undefined) return 'null';
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Object.prototype.toString.call(v) === '[object Array]'){
      var a = '['; for (var i = 0; i < v.length; i++) a += (i ? ',' : '') + stableStringify(v[i]); return a + ']';
    }
    var ks = [], k; for (k in v){ if (Object.prototype.hasOwnProperty.call(v, k)) ks.push(k); }
    ks.sort();
    var s = '';
    for (var j = 0; j < ks.length; j++){
      if (v[ks[j]] === undefined) continue;
      s += (s ? ',' : '') + JSON.stringify(ks[j]) + ':' + stableStringify(v[ks[j]]);
    }
    return '{' + s + '}';
  }
  function canonicalOf(id, input){
    var st = ST(); if (!st) return null;
    var v = st.validate(input);
    if (!v.ok) return null;
    return stableStringify({ schema: st.schemaVersion, id: String(id), title: v.value.title,
                             scene: v.value.scene, cast: v.value.cast,
                             startCondition: v.value.startCondition, startRules: v.value.startRules });
  }
  /* mid の識別子に使う短い hash。★content_hash の契約ではない（server hash は worker が計算する）。
     FNV-1a 32bit を 2 本（オフセット違い）で 16 hex。crypto.subtle は非同期かつ secure context 依存なので使わない。 */
  function localHash(str){
    var s = String(str == null ? '' : str), h1 = 0x811c9dc5, h2 = 0x01000193, i, c;
    for (i = 0; i < s.length; i++){
      c = s.charCodeAt(i);
      h1 ^= c; h1 = (h1 * 0x01000193) >>> 0;
      h2 = ((h2 ^ (c + i)) * 0x85ebca6b) >>> 0;
    }
    return ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);
  }
  function midFor(id, cloudRev, hash){ return 'sc:' + id + ':' + cloudRev + ':' + hash; }

  /* ★★GPT #L13entry: server 応答から cloudRev / contentHash を読む唯一の口。
     ・worker v43 は自己記述的な `cloudRev` / `contentHash` を返す → **こちらを primary** に読む。
     ・`rev` / `serverHash` は同値の旧名。alias が無い応答（将来の縮退や中継）でも壊れないよう fallback に残す。
     ★`rev` を primary にすると scenarioRev と取り違えたときに黙って通るので、順序はこの向きで固定する。 */
  function cloudRevOfRow(r){
    if (!r) return 0;
    var v = (r.cloudRev !== undefined && r.cloudRev !== null) ? r.cloudRev : r.rev;
    v = Math.floor(+v || 0);
    return (v > 0) ? v : 0;
  }
  function contentHashOfRow(r){
    if (!r) return null;
    var h = (r.contentHash !== undefined) ? r.contentHash : r.serverHash;
    return (h == null || h === '') ? null : String(h);
  }

  /* body（fix820 の保存形）→ validate() が受け付ける input 形へ。
     ★body は scenarioId / schemaVersion を持つが、それは受理面の field ではないので落とす。 */
  function inputFromBody(title, body){
    var b = (body && typeof body === 'object') ? body : {};
    var out = { title: String(title == null ? '' : title) };
    if (b.scene !== undefined) out.scene = b.scene;
    if (b.cast !== undefined) out.cast = b.cast;
    if (b.startCondition !== undefined) out.startCondition = b.startCondition;
    if (b.startRules !== undefined) out.startRules = b.startRules;
    return out;
  }
  function inputFromRecord(rec){
    var r = (rec && typeof rec === 'object') ? rec : {};
    var out = { title: String(r.title == null ? '' : r.title) };
    if (r.scene !== undefined) out.scene = r.scene;
    if (r.cast !== undefined) out.cast = r.cast;
    if (r.startCondition !== undefined) out.startCondition = r.startCondition;
    if (r.startRules !== undefined) out.startRules = r.startRules;
    return out;
  }

  /* ================= plan（純関数・通信 0・書込 0） =================
     local 一覧 + remote 一覧 → 各 id に対する 1 つの action。テスト可能な形に切り出す。 */
  function plan(localRows, remoteRows){
    var byId = {}, i, r, e;
    for (i = 0; i < (localRows || []).length; i++){
      e = localRows[i]; if (!e || !e.scenarioId) continue;
      byId[String(e.scenarioId)] = { id: String(e.scenarioId), local: e, remote: null };
    }
    for (i = 0; i < (remoteRows || []).length; i++){
      r = remoteRows[i]; if (!r || !r.id) continue;
      if (!byId[String(r.id)]) byId[String(r.id)] = { id: String(r.id), local: null, remote: null };
      byId[String(r.id)].remote = r;
    }
    var out = [], k;
    for (k in byId){
      if (!Object.prototype.hasOwnProperty.call(byId, k)) continue;
      out.push(decide(byId[k]));
    }
    out.sort(function(a, b){ return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0); });
    return out;
  }
  function decide(p){
    var L = p.local, Rm = p.remote;
    var lc = L ? (+L.cloudRev || 0) : 0;
    var ld = L ? !!L.dirty : false;
    var ldel = L ? !!L.deleted : false;
    var rc = Rm ? cloudRevOfRow(Rm) : 0;                   /* ★cloudRev を primary に読む */
    var rdel = Rm ? !!Rm.deleted : false;
    var base = { id: p.id, localCloudRev: lc, remoteCloudRev: rc, dirty: ld,
                 localDeleted: ldel, remoteDeleted: rdel, remoteHash: Rm ? contentHashOfRow(Rm) : null };

    if (!Rm){
      /* remote に行が無い */
      if (!L) return mk(base, 'NOOP', 'neither side has this id');
      if (ldel) return mk(base, 'NOOP', 'local tombstone that was never uploaded (nothing to delete)');
      return mk(base, 'PUSH_CREATE', 'local only → putscenario expectedRev=0');
    }
    if (!L){
      /* local に無い（別端末で作られた） */
      if (rdel) return mk(base, 'NOOP', 'remote tombstone with no local row');
      return mk(base, 'PULL', 'remote only → getscenario');
    }
    if (rdel){
      if (ldel) return mk(base, 'NOOP', 'both deleted');
      /* ★★R10 解消（Fable review 2026-09-19）: remote の墓標も「remote が進んだ」ことに変わりはないので、
         裁定 #SP8 line 3 の第 4 分岐（remote > local & dirty → conflict・自動上書きしない）を
         **削除にもそのまま適用**する。local が dirty のまま黙って body を消すのは data loss であり、
         「never auto-overwrite」と矛盾する。dirty なら 0 バイトも書かずに Owner へ 2 択を出す。 */
      if (ld) return mk(base, 'CONFLICT', 'remote が削除・local に未同期編集（自動で消さない）');
      return mk(base, 'PULL_DELETE', 'remote deleted かつ local は clean → local body を消して META を墓標に');
    }
    if (ldel){
      if (!ld) return mk(base, 'NOOP', 'tombstone already pushed');
      if (rc !== lc) return mk(base, 'CONFLICT', 'local 削除と remote 更新が競合（自動で消さない）');
      return mk(base, 'PUSH_DELETE', 'local tombstone → deletescenario');
    }
    if (rc < lc) return mk(base, 'NOOP', 'remote が古い（ダウングレード禁止）');
    if (rc === lc) return ld ? mk(base, 'PUSH_UPDATE', 'same cloudRev + dirty → putscenario')
                             : mk(base, 'NOOP', 'same cloudRev, not dirty');
    /* rc > lc */
    return ld ? mk(base, 'CONFLICT', 'remote が進んでいて local も未同期編集がある')
              : mk(base, 'PULL', 'remote が進んでいて local は clean');
  }
  function mk(base, action, why){ base.action = action; base.why = why; return base; }

  /* ================= 実行 ================= */
  var S = { running: false, lastReport: null, conflicts: {} };

  function syncOnce(cb){
    var done = function(rep){ S.running = false; S.lastReport = rep; if (cb) cb(rep); };
    if (S.running){ if (cb) cb({ ok: false, code: 'BUSY' }); return; }
    if (!enabled()){ if (cb) cb({ ok: false, code: killed() ? 'KILLED' : 'OFF' }); return; }
    var st = ST();
    if (!st || typeof st.listAll !== 'function'){ if (cb) cb({ ok: false, code: 'NO_STORE' }); return; }
    if (!st.f872On || !st.f872On()){ if (cb) cb({ ok: false, code: 'STORE_GATE_OFF' }); return; }
    S.running = true;
    checkCapability(function(supported){
      if (!supported){ done({ ok: false, code: 'WORKER_TOO_OLD' }); return; }
      post({ op: 'listscenario' }, function(res, err){
        if (err || !res){ done({ ok: false, code: err || 'NO_RESPONSE' }); return; }
        if (res.status !== 200 || !res.j || res.j.ok !== true){ done({ ok: false, code: 'LIST_FAILED', status: res.status, errorCode: res.j && res.j.errorCode }); return; }
        var local = st.listAll();
        if (!local.ok){ done({ ok: false, code: local.code }); return; }
        var acts = plan(local.scenarios, res.j.scenarios || []);
        runActions(acts, function(rep){ rep.plan = acts; done(rep); });
      });
    });
  }

  function runActions(acts, cb){
    var i = 0, rep = { ok: true, pushed: 0, pulled: 0, deletedLocal: 0, deletedRemote: 0, conflicts: [], noop: 0, errors: [] };
    function next(){
      if (i >= acts.length){ S.conflicts = {}; for (var c = 0; c < rep.conflicts.length; c++) S.conflicts[rep.conflicts[c].id] = rep.conflicts[c]; cb(rep); return; }
      var a = acts[i++];
      if (a.action === 'NOOP'){ rep.noop++; next(); return; }
      if (a.action === 'CONFLICT'){ rep.conflicts.push(a); notifyConflict(a); next(); return; }
      if (a.action === 'PULL'){ doPull(a, rep, next); return; }
      if (a.action === 'PULL_DELETE'){ doPullDelete(a, rep, next); return; }
      if (a.action === 'PUSH_CREATE' || a.action === 'PUSH_UPDATE'){ doPush(a, rep, next); return; }
      if (a.action === 'PUSH_DELETE'){ doPushDelete(a, rep, next); return; }
      rep.errors.push({ id: a.id, code: 'UNKNOWN_ACTION' }); next();
    }
    next();
  }

  function doPull(a, rep, next){
    post({ op: 'getscenario', id: a.id }, function(res, err){
      if (err || !res || res.status !== 200 || !res.j || res.j.ok !== true){
        rep.ok = false; rep.errors.push({ id: a.id, code: 'GET_FAILED', status: res && res.status }); next(); return;
      }
      if (res.j.deleted === true){ applyRemoteDelete(a, rep, cloudRevOfRow(res.j), next); return; }
      var st = ST();
      var r = st.f872ApplyRemote(a.id, inputFromRecord(res.j.record), cloudRevOfRow(res.j), +res.j.scenarioRev || 0);
      if (!r.ok){ rep.ok = false; rep.errors.push({ id: a.id, code: r.code || 'APPLY_FAILED' }); }
      else rep.pulled++;
      next();
    });
  }
  function applyRemoteDelete(a, rep, cloudRev, next){
    var st = ST();
    var r = st.f872ApplyRemoteDelete(a.id, +cloudRev || 0);
    if (!r.ok){ rep.ok = false; rep.errors.push({ id: a.id, code: r.code || 'APPLY_DELETE_FAILED' }); }
    else rep.deletedLocal++;
    next();
  }
  function doPullDelete(a, rep, next){ applyRemoteDelete(a, rep, a.remoteCloudRev, next); }

  function doPush(a, rep, next){
    var st = ST();
    var body = st.f872RawBody(a.id);
    if (!body.ok){ rep.ok = false; rep.errors.push({ id: a.id, code: body.code || 'BODY_UNREADABLE' }); next(); return; }
    var meta = null, all = st.listAll();
    if (all.ok){ for (var i = 0; i < all.scenarios.length; i++){ if (all.scenarios[i].scenarioId === a.id){ meta = all.scenarios[i]; break; } } }
    if (!meta){ rep.ok = false; rep.errors.push({ id: a.id, code: 'META_MISSING' }); next(); return; }
    var input = inputFromBody(meta.title, body.body);
    var canon = canonicalOf(a.id, input);
    if (canon == null){ rep.ok = false; rep.errors.push({ id: a.id, code: 'LOCAL_INVALID' }); next(); return; }
    var mid = midFor(a.id, a.localCloudRev, localHash(canon));
    post({ op: 'putscenario', id: a.id, expectedRev: a.localCloudRev, scenarioRev: (+meta.rev || 0),
           record: input, mid: mid, clientMeta: { build: buildTag() } }, function(res, err){
      if (err || !res){ rep.ok = false; rep.errors.push({ id: a.id, code: err || 'NO_RESPONSE' }); next(); return; }
      if (res.status === 200 && res.j && res.j.ok === true){
        var m = st.f872MarkPushed(a.id, cloudRevOfRow(res.j));
        if (!m.ok){ rep.ok = false; rep.errors.push({ id: a.id, code: m.code || 'MARK_FAILED' }); }
        else rep.pushed++;
        next(); return;
      }
      rep.ok = false;
      var code = (res.j && res.j.errorCode) || ('HTTP_' + res.status);
      /* ★409 は **自動解決しない**。UI へ渡して Owner に 2 択を出す。 */
      if (res.status === 409 && (code === 'scenario-rev-mismatch' || code === 'scenario-exists' || code === 'scenario-deleted')){
        var cf = { id: a.id, action: 'CONFLICT', errorCode: code,
                   localCloudRev: a.localCloudRev, remoteCloudRev: (res.j && res.j.serverRev) || 0,
                   remoteScenarioRev: (res.j && res.j.serverScenarioRev) || 0, dirty: true,
                   localDeleted: !!a.localDeleted,
                   /* ★409 scenario-deleted も「remote で削除された」衝突として UI へ渡す（文面が変わる） */
                   remoteDeleted: (code === 'scenario-deleted'),
                   why: 'server が 409 を返した（書き込み 0）' };
        rep.conflicts.push(cf); notifyConflict(cf); next(); return;
      }
      rep.errors.push({ id: a.id, code: code, status: res.status });
      next();
    });
  }

  function doPushDelete(a, rep, next){
    var st = ST();
    var mid = midFor(a.id, a.localCloudRev, 'del');
    post({ op: 'deletescenario', id: a.id, expectedRev: a.localCloudRev, mid: mid }, function(res, err){
      if (err || !res){ rep.ok = false; rep.errors.push({ id: a.id, code: err || 'NO_RESPONSE' }); next(); return; }
      if (res.status === 200 && res.j && res.j.ok === true){
        var m = st.f872MarkPushed(a.id, cloudRevOfRow(res.j));
        if (!m.ok){ rep.ok = false; rep.errors.push({ id: a.id, code: m.code || 'MARK_FAILED' }); }
        else rep.deletedRemote++;
        next(); return;
      }
      var code = (res.j && res.j.errorCode) || ('HTTP_' + res.status);
      if (code === 'scenario-deleted'){
        /* server 側で既に墓標 = 目的は達成されている。local の dirty だけ降ろす。 */
        st.f872MarkPushed(a.id, (res.j && res.j.serverRev) || a.localCloudRev);
        rep.deletedRemote++; next(); return;
      }
      rep.ok = false; rep.errors.push({ id: a.id, code: code, status: res.status });
      next();
    });
  }

  function buildTag(){
    try { var b = document.querySelector('meta[name="chronicle-build"]'); if (b && b.content) return String(b.content).slice(0, 40); } catch(e){}
    return '20260919-sp8';
  }

  /* ================= 衝突 UI への受け渡し（fix825 が描く・この module は描かない） ================= */
  function notifyConflict(info){
    try {
      if (typeof window.__v292Dfix825ScenarioConflict === 'function'){ window.__v292Dfix825ScenarioConflict(info); return; }
      if (window.__v292Dfix825 && window.__v292Dfix825.api && typeof window.__v292Dfix825.api.f872Conflict === 'function'){
        window.__v292Dfix825.api.f872Conflict(info); return;
      }
    } catch(e){}
    try { console.warn(TAG, 'CONFLICT (no UI host)', info); } catch(e){}
  }

  /* 衝突の解決（Owner が選ぶ 2 択だけ。force overwrite は **作らない**）。
       'cloud' … クラウド版を使う（local の未同期編集は失われる。UI が明示してから呼ぶこと）
       'fork'  … 新しい ID として保存（local の内容を新 ID へ create し、元 ID はクラウド版を取り込む） */
  function resolveConflict(id, choice, cb){
    var done = function(r){ if (cb) cb(r); return r; };
    if (!enabled()) return done({ ok: false, code: killed() ? 'KILLED' : 'OFF' });
    var st = ST(); if (!st) return done({ ok: false, code: 'NO_STORE' });
    if (choice !== 'cloud' && choice !== 'fork') return done({ ok: false, code: 'BAD_CHOICE' });

    /* local の内容は fork のときだけ要る。先に読んでおく（cloud 取り込みで消えるため）。 */
    var forkInput = null;
    if (choice === 'fork'){
      var body = st.f872RawBody(id);
      var all = st.listAll(), meta = null;
      if (all.ok){ for (var i = 0; i < all.scenarios.length; i++){ if (all.scenarios[i].scenarioId === id){ meta = all.scenarios[i]; break; } } }
      if (!body.ok || !meta) return done({ ok: false, code: 'LOCAL_UNREADABLE' });
      forkInput = inputFromBody(meta.title, body.body);
    }
    post({ op: 'getscenario', id: id }, function(res, err){
      if (err || !res || res.status !== 200 || !res.j || res.j.ok !== true){
        return done({ ok: false, code: 'GET_FAILED', status: res && res.status });
      }
      var forked = null;
      if (choice === 'fork'){
        var c = st.create(forkInput);
        if (!c.ok) return done({ ok: false, code: 'FORK_FAILED', detail: c.code });
        forked = c.scenarioId;
      }
      var applied;
      if (res.j.deleted === true) applied = st.f872ApplyRemoteDelete(id, cloudRevOfRow(res.j));
      else applied = st.f872ApplyRemote(id, inputFromRecord(res.j.record), cloudRevOfRow(res.j), +res.j.scenarioRev || 0);
      if (!applied.ok) return done({ ok: false, code: applied.code || 'APPLY_FAILED', forkedTo: forked });
      delete S.conflicts[id];
      return done({ ok: true, id: id, choice: choice, forkedTo: forked, cloudRev: applied.cloudRev });
    });
  }

  window.__v292Dfix872 = {
    version: VERSION,
    /* 純関数（通信 0・書込 0）— harness はここを直接測る */
    plan: plan,
    decide: decide,
    canonicalOf: canonicalOf,
    stableStringify: stableStringify,
    localHash: localHash,
    midFor: midFor,
    inputFromBody: inputFromBody,
    inputFromRecord: inputFromRecord,
    cloudRevOfRow: cloudRevOfRow,
    contentHashOfRow: contentHashOfRow,
    /* 実行 */
    syncOnce: syncOnce,
    resolveConflict: resolveConflict,
    conflicts: function(){ var o = [], k; for (k in S.conflicts){ if (Object.prototype.hasOwnProperty.call(S.conflicts, k)) o.push(S.conflicts[k]); } return o; },
    state: function(){
      return { version: VERSION, enabled: enabled(), killed: killed(), running: S.running,
               loggedIn: isLoggedIn(), proxyUrl: proxyUrl(), capability: { checked: CAP.checked, supported: CAP.supported },
               storeReady: !!(ST() && ST().f872On && ST().f872On()),
               lastReport: S.lastReport, conflictCount: (function(){ var n = 0, k; for (k in S.conflicts) n++; return n; })(),
               /* ★この module は起動時に 1 バイトも通信しない。syncOnce を誰かが呼んだときだけ動く。 */
               autoSync: false };
    }
  };
  try {
    console.log(TAG, 'loaded ('
      + (killed() ? 'KILLED v292Dfix872Off=1' : (enabled() ? 'ENABLED (v292Dfix872On=1)' : 'dormant — set v292Dfix872On=1 to enable'))
      + '; no caller runs automatically)');
  } catch(e){}
})();
