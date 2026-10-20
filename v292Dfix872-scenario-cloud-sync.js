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
 *   ── ★★S-4b（GPT #127-FT・2026-10-19）: ログイン中は自動同期 ──
 *     2' 自動     : この document で /auth/me が active な owner / beta と答えた（fix893 serverMe）なら、
 *                   v292Dfix872On が無くても ON。kill（v292Dfix872Off='1'）と server の kill（scenarioSupported=0）は従来どおり最優先。
 *                   自動だけ止める端末 kill = v292Dfix872AutoOff='1'（手動の「☁ 端末間で同期」は残る）。
 *     きっかけ    : HOME を開いた時（1 ページ 1 回・非同期）／シナリオの保存・削除の直後（local を確定してから）／
 *                   シナリオから物語を始める直前（その 1 本だけ。衝突・削除済みなら始めない。通信できない時は local の版で始め、未同期を表示）。
 *     送る物      : 作成時に iso2 が記録した持ち主（c=w=いまのアカウント）のシナリオだけ。持ち主の記録が無い古いシナリオは
 *                   自動では送らない（手動の選択＝ fix966 の写しだけ）。別のアカウントの物は送らない・取り込みで上書きしない。
 *     衝突        : 自動で上書きしない（2 択の UI）。応答を取り逃した送信だけは同じ mid の再送（idem2 の replay）で 1 回だけ確かめる。
 *     再試行      : きっかけ 1 回につき最大 1 回。タイマーで繰り返さない。
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
  var VERSION = 'v292Dfix872-20261019-s4b-auto-v1.1';
  var TIMEOUT_MS = 20000;
  var START_TIMEOUT_MS = 8000;      /* ★S-4b: 物語を始める直前の照合は短く待つ（通信できない時に始められなくしない） */

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function killed(){ return lsg('v292Dfix872Off') === '1'; }
  /* ★★S-4b: ログイン中（この document の /auth/me = active な owner / beta）は既定で ON。mark ではなく server の答えだけを見る。 */
  var AUTO_ENT = { owner: 1, beta: 1 };
  function autoOff(){ return lsg('v292Dfix872AutoOff') === '1'; }
  function serverAccount(){
    try {
      var F = window.__v292Dfix893;
      if (!F || !F.active || typeof F.serverMe !== 'function') return null;
      var m = F.serverMe();
      if (!m || !m.accountId) return null;
      if (!AUTO_ENT[String(m.entitlement || '')]) return null;
      if (m.status != null && String(m.status) !== 'active') return null;
      return String(m.accountId);
    } catch(e){ return null; }
  }
  function autoActive(){ return !killed() && !autoOff() && !!serverAccount(); }
  function enabled(){ return !killed() && (lsg('v292Dfix872On') === '1' || autoActive()); }
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
    try { ac = new AbortController(); timer = setTimeout(function(){ try { ac.abort(); } catch(e){} }, (S.runTimeout > 0 ? S.runTimeout : TIMEOUT_MS)); } catch(e){}
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
  var CAP = { checked: false, supported: false, netFails: 0 };
  /* ★S-4b: cb(supported, netFail)。答え（JSON）を受け取れた時だけ記憶する（server kill = scenarioSupported 0 は
     このページの間ずっと「非対応」= 以後 scenario の通信 0）。通信失敗は記憶しない（次のきっかけで 1 回だけ聞き直す）。 */
  function checkCapability(cb){
    if (CAP.checked){ cb(CAP.supported, false); return; }
    if (!enabled()){ cb(false, false); return; }
    var ac = null, timer = null;
    try { ac = new AbortController(); timer = setTimeout(function(){ try { ac.abort(); } catch(e){} }, (S.runTimeout > 0 ? S.runTimeout : TIMEOUT_MS)); } catch(e){}
    var o = { method: 'GET' }; if (ac) o.signal = ac.signal;
    var netFail = function(){ if (timer) clearTimeout(timer); CAP.netFails++; cb(false, true); };
    try {
      window.fetch(proxyUrl() + '/', o).then(function(res){ return res.json(); })
        .then(function(j){ if (timer) clearTimeout(timer); CAP.checked = true; CAP.supported = !!(j && j.scenarioSupported === 1); cb(CAP.supported, false); })
        ['catch'](netFail);
    } catch(e){ netFail(); }
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
                 localDeleted: ldel, remoteDeleted: rdel, remoteHash: Rm ? contentHashOfRow(Rm) : null, hasLocal: !!L };

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
    /* ★★S-4b（裁定 C）: この端末で一度もクラウドと結び付いていない（cloudRev=0）シナリオと同じ ID の行がクラウドにある。
       中身が同じだと証明できた時（PULL_ADOPT）だけ結び付ける。違う・削除済み → 衝突（自動で上書きも削除もしない）。 */
    if (lc === 0 && !ldel && !ld){
      if (rdel){ base.deviceOnly = true; return mk(base, 'CONFLICT', 'この端末だけのシナリオと同じ ID がクラウドで削除済み（自動で消さない）'); }
      return mk(base, 'PULL_ADOPT', 'この端末だけのシナリオと同じ ID がクラウドにある → 中身が同じ時だけ結び付ける');
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

  /* ★fix966b（GPT #127-C）: opts.pushAllow(id) が false の PUSH_* は送らない（NOOP 扱い・skippedNotApproved に数える）。
     opts を渡さない呼び手は従来どおり（全件）。PULL / PULL_DELETE / CONFLICT の規則は 1 文字も変えない。
     ★★S-4b の opts（自動同期の呼び手だけが渡す。手動の呼び手は渡さない＝従来どおり）:
       expectAccount  … 一覧を受け取った後・書き込む前に /auth/me をもう一度聞き、この accountId のままか確かめる
       onlyId         … その 1 本だけを処理する（始める直前の照合）
       timeoutMs      … この 1 回の通信の待ち時間
       quietConflicts … 衝突を画面に出さず記録だけ（シナリオを開いた時・始める時に 2 択を出す）。interactiveIds の ID は出す
       replayConflicts… 未同期の編集がある衝突は、同じ mid で 1 回だけ再送（応答を取り逃した自分の送信なら idem2 が同じ 200 を返す）
       ownerGuard     … 別のアカウントの持ち主記録がある local には取り込みで書かない（保留）
       skipPull(id)   … 編集画面で開いているシナリオには取り込みで書かない（次のきっかけへ回す） */
  function syncOnce(cb, opts){
    opts = opts || {};
    var done = function(rep){ S.running = false; S.runTimeout = 0; S.lastReport = rep; if (cb) cb(rep); };
    if (S.running){ if (cb) cb({ ok: false, code: 'BUSY' }); return; }
    if (!enabled()){ if (cb) cb({ ok: false, code: killed() ? 'KILLED' : 'OFF' }); return; }
    var st = ST();
    if (!st || typeof st.listAll !== 'function'){ if (cb) cb({ ok: false, code: 'NO_STORE' }); return; }
    if (!st.f872On || !st.f872On()){ if (cb) cb({ ok: false, code: 'STORE_GATE_OFF' }); return; }
    var hold0 = opts.expectAccount ? accountHold(opts.expectAccount) : null;
    if (hold0){ if (cb) cb({ ok: false, code: 'ACCOUNT_HOLD', why: hold0 }); return; }
    S.running = true; S.runTimeout = (opts.timeoutMs > 0) ? opts.timeoutMs : 0;
    checkCapability(function(supported, netFail){
      if (!supported){ done({ ok: false, code: netFail ? 'NETWORK_FAILED' : 'WORKER_TOO_OLD' }); return; }
      post({ op: 'listscenario' }, function(res, err){
        if (err || !res){ done({ ok: false, code: err || 'NO_RESPONSE' }); return; }
        if (res.status !== 200 || !res.j || res.j.ok !== true){ done({ ok: false, code: 'LIST_FAILED', status: res.status, errorCode: res.j && res.j.errorCode }); return; }
        var go = function(){
          var local = st.listAll();
          if (!local.ok){ done({ ok: false, code: local.code }); return; }
          var acts = plan(local.scenarios, res.j.scenarios || []);
          runActions(acts, function(rep){ rep.plan = acts; done(rep); }, opts);
        };
        if (!opts.expectAccount){ go(); return; }
        whoNow(function(acct, wNet){
          if (!acct){ done({ ok: false, code: wNet ? 'NETWORK_FAILED' : 'ACCOUNT_UNCONFIRMED' }); return; }
          if (acct !== opts.expectAccount){ done({ ok: false, code: 'ACCOUNT_CHANGED' }); return; }
          var h1 = accountHold(opts.expectAccount);
          if (h1){ done({ ok: false, code: 'ACCOUNT_HOLD', why: h1 }); return; }
          go();
        });
      });
    });
  }

  /* ★S-4b: この page の Pages origin の /auth/me（fix966 / f757 と同じ口）。cb(accountId|null, netFail) */
  function whoNow(cb){
    var ac = null, timer = null, fired = false;
    var fin = function(a, n){ if (fired) return; fired = true; if (timer) clearTimeout(timer); cb(a, n); };
    try { ac = new AbortController(); timer = setTimeout(function(){ try { ac.abort(); } catch(e){} }, (S.runTimeout > 0 ? S.runTimeout : TIMEOUT_MS)); } catch(e){}
    var o = { method: 'GET', credentials: 'same-origin', cache: 'no-store', headers: { 'x-chronicle-csrf': '1' } }; if (ac) o.signal = ac.signal;
    try {
      window.fetch('/api/auth/me', o).then(function(r){ return r.json().then(function(j){ return { s: r.status, j: j }; }, function(){ return { s: r.status, j: null }; }); })
        .then(function(x){ var j = x && x.j; fin((j && j.ok === true && typeof j.accountId === 'string' && j.accountId) ? j.accountId : null, false); },
              function(){ fin(null, true); });
    } catch(e){ fin(null, true); }
  }
  /* ★S-4b: 送信の関所（iso2）とこの document のアカウントが揃っているか。揃わなければ理由（何も送らない・書かない） */
  function iso2(){ try { var G = window.__v292Diso2; return (G && G.__armed && typeof G.check === 'function' && typeof G.owner === 'function') ? G : null; } catch(e){ return null; } }
  function markAcct(){ try { var o = JSON.parse(lsg('v292Dfix837_sess') || 'null'); return (o && o.sid === 'cookie' && o.acct) ? String(o.acct) : ''; } catch(e){ return ''; } }
  function accountHold(expect){
    if (serverAccount() !== expect) return 'SERVER_ME_CHANGED';
    if (markAcct() !== expect) return 'MARK_MISMATCH';
    var G = iso2();
    if (!G) return null;      /* iso2 が無い端末: 持ち主の記録が無い＝送信は 0 件（stampOk が false）。取り込みだけ */
    var why = null; try { why = G.check({ op: 'listscenario' }, 'fix872:auto'); } catch(e){ why = 'ISO2_ERROR'; }
    if (why) return 'ISO2:' + String(why).slice(0, 40);
    var o = null; try { o = G.owner(); } catch(e){ o = null; }
    if (!o || o.bad || o.now !== o.doc) return 'ISO2_OWNER';
    return null;
  }
  /* 作成時に iso2 が記録した持ち主（c）と最後に書いた人（w）が、どちらもいまのアカウントか（送信の関所の判定も通るか） */
  function stampOk(id){
    var G = iso2(); if (!G || typeof G.stampOf !== 'function') return false;
    var o = null; try { o = G.owner(); } catch(e){ o = null; }
    if (!o || o.bad || o.now !== o.doc) return false;
    var s = null; try { s = G.stampOf(String(id), 'c'); } catch(e){ s = null; }
    if (!s || s.c !== o.doc || s.w !== o.doc) return false;
    var why = null; try { why = G.check({ op: 'putscenario', id: String(id), record: {} }, 'fix872:auto'); } catch(e){ why = 'ISO2_ERROR'; }
    return !why;
  }
  /* 別のアカウントの持ち主記録がある local か（記録が無い＝ false） */
  function localForeign(id){
    var G = iso2(); if (!G || typeof G.stampOf !== 'function') return false;
    var o = null, s = null;
    try { o = G.owner(); s = G.stampOf(String(id), 'c'); } catch(e){ return true; }
    return !!(s && o && (s.c !== o.doc || s.w !== o.doc));
  }
  function metaOf(id){
    var st = ST(); if (!st) return null;
    var all = st.listAll(); if (!all || !all.ok) return null;
    for (var i = 0; i < all.scenarios.length; i++){ if (all.scenarios[i].scenarioId === id) return all.scenarios[i]; }
    return null;
  }
  /* 計画を立てた後に local が変わっていないか（取り込みで書く直前に確かめる。変わっていたら書かない＝次のきっかけへ） */
  function localMoved(a){
    var m = metaOf(a.id);
    if (!a.hasLocal) return !!(m && !m.deleted);
    if (!m) return true;
    return (!!m.dirty !== !!a.dirty) || ((+m.cloudRev || 0) !== (+a.localCloudRev || 0)) || (!!m.deleted !== !!a.localDeleted);
  }

  function runActions(acts, cb, opts){
    opts = opts || {};
    var i = 0, rep = { ok: true, pushed: 0, pulled: 0, adopted: 0, replayed: 0, deletedLocal: 0, deletedRemote: 0, conflicts: [], noop: 0, errors: [], skippedNotApproved: 0,
                       deferred: 0, held: [], pushedIds: [], pulledIds: [], deletedLocalIds: [], onlyId: opts.onlyId ? String(opts.onlyId) : null };
    var allow = (typeof opts.pushAllow === 'function') ? opts.pushAllow : null;
    var only = rep.onlyId;
    function allowed(id){ if (!allow) return true; try { return !!allow(id); } catch(eA){ return false; } }
    function skipPull(id){ if (typeof opts.skipPull !== 'function') return false; try { return !!opts.skipPull(id); } catch(e){ return true; } }
    function finish(){
      if (only) delete S.conflicts[only]; else S.conflicts = {};
      for (var c = 0; c < rep.conflicts.length; c++) S.conflicts[rep.conflicts[c].id] = rep.conflicts[c];
      cb(rep);
    }
    function next(){
      if (i >= acts.length){ finish(); return; }
      var a = acts[i++];
      if (only && a.id !== only){ next(); return; }
      if (a.action === 'NOOP'){ rep.noop++; next(); return; }
      var pullLike = (a.action === 'PULL' || a.action === 'PULL_DELETE' || a.action === 'PULL_ADOPT');
      if (pullLike && skipPull(a.id)){ rep.deferred++; next(); return; }
      if (pullLike && opts.ownerGuard && a.hasLocal && localForeign(a.id)){ rep.held.push({ id: a.id, code: 'LOCAL_OWNER_OTHER' }); next(); return; }
      if (/^PUSH_/.test(a.action) && !allowed(a.id)){ rep.skippedNotApproved++; next(); return; }
      if (a.action === 'CONFLICT'){
        /* ★S-4b: 未同期の編集がある衝突は、同じ mid で 1 回だけ再送する。応答を取り逃した自分の送信なら idem2 が
           同じ 200 を返す（rev は 2 回進まない）。別の端末の変更なら CAS が 409 → 従来どおり衝突（自動上書きなし）。 */
        if (opts.replayConflicts && a.dirty && !a.localDeleted && !a.remoteDeleted && !a.deviceOnly && allowed(a.id)){ a.replay = true; doPush(a, rep, next, opts); return; }
        rep.conflicts.push(a); notifyConflict(a, opts); next(); return;
      }
      if (a.action === 'PULL'){ doPull(a, rep, next, opts); return; }
      if (a.action === 'PULL_DELETE'){ doPullDelete(a, rep, next); return; }
      if (a.action === 'PULL_ADOPT'){ doPullAdopt(a, rep, next, opts); return; }
      if (a.action === 'PUSH_CREATE' || a.action === 'PUSH_UPDATE'){ doPush(a, rep, next, opts); return; }
      if (a.action === 'PUSH_DELETE'){ doPushDelete(a, rep, next); return; }
      rep.errors.push({ id: a.id, code: 'UNKNOWN_ACTION' }); next();
    }
    next();
  }

  function doPull(a, rep, next, opts){
    post({ op: 'getscenario', id: a.id }, function(res, err){
      if (err || !res || res.status !== 200 || !res.j || res.j.ok !== true){
        rep.ok = false; rep.errors.push({ id: a.id, code: 'GET_FAILED', status: res && res.status }); next(); return;
      }
      /* ★S-4b: 待っている間に local が変わった（保存された等）なら書かない（未同期の編集を消さない） */
      if (localMoved(a) || (opts && opts.ownerGuard && a.hasLocal && localForeign(a.id))){ rep.deferred++; next(); return; }
      if (res.j.deleted === true){ applyRemoteDelete(a, rep, cloudRevOfRow(res.j), next); return; }
      var st = ST();
      var r = st.f872ApplyRemote(a.id, inputFromRecord(res.j.record), cloudRevOfRow(res.j), +res.j.scenarioRev || 0, +res.j.updatedAt || 0);   /* ★SC-DATE */
      if (!r.ok){ rep.ok = false; rep.errors.push({ id: a.id, code: r.code || 'APPLY_FAILED' }); }
      else { rep.pulled++; rep.pulledIds.push(a.id); }
      next();
    });
  }
  function applyRemoteDelete(a, rep, cloudRev, next){
    var st = ST();
    var r = st.f872ApplyRemoteDelete(a.id, +cloudRev || 0);
    if (!r.ok){ rep.ok = false; rep.errors.push({ id: a.id, code: r.code || 'APPLY_DELETE_FAILED' }); }
    else { rep.deletedLocal++; rep.deletedLocalIds.push(a.id); }
    next();
  }
  function doPullDelete(a, rep, next){
    if (localMoved(a)){ rep.deferred++; next(); return; }
    applyRemoteDelete(a, rep, a.remoteCloudRev, next);
  }
  /* ★★S-4b PULL_ADOPT: この端末だけのシナリオ（cloudRev 0）と同じ ID の行がクラウドにある。
     両方を同じ canonical 規則（canonicalOf）で文字列にして **完全に同じ時だけ** 結び付ける（中身は 1 文字も変わらない）。
     違う・読めない・削除済み → 衝突（自動で上書きしない。2 択）。 */
  function doPullAdopt(a, rep, next, opts){
    post({ op: 'getscenario', id: a.id }, function(res, err){
      if (err || !res || res.status !== 200 || !res.j || res.j.ok !== true){
        rep.ok = false; rep.errors.push({ id: a.id, code: 'GET_FAILED', status: res && res.status }); next(); return;
      }
      if (localMoved(a)){ rep.deferred++; next(); return; }
      var st = ST();
      var cf = function(why){
        var c = { id: a.id, action: 'CONFLICT', deviceOnly: true, localCloudRev: 0, remoteCloudRev: cloudRevOfRow(res.j),
                  remoteScenarioRev: +res.j.scenarioRev || 0, dirty: !!a.dirty, localDeleted: false, remoteDeleted: res.j.deleted === true, why: why };
        rep.conflicts.push(c); notifyConflict(c, opts); next();
      };
      if (res.j.deleted === true) return cf('この端末だけのシナリオと同じ ID がクラウドで削除済み');
      var body = st.f872RawBody(a.id), meta = metaOf(a.id);
      var lcs = (body && body.ok && meta) ? canonicalOf(a.id, inputFromBody(meta.title, body.body)) : null;
      var rcs = canonicalOf(a.id, inputFromRecord(res.j.record));
      if (lcs == null || rcs == null || lcs !== rcs) return cf('この端末だけのシナリオと同じ ID の別の中身がクラウドにある');
      var r = st.f872ApplyRemote(a.id, inputFromRecord(res.j.record), cloudRevOfRow(res.j), +res.j.scenarioRev || 0, +res.j.updatedAt || 0);   /* ★SC-DATE */
      if (!r.ok){ rep.ok = false; rep.errors.push({ id: a.id, code: r.code || 'APPLY_FAILED' }); }
      else rep.adopted++;
      next();
    });
  }

  function doPush(a, rep, next, opts){
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
    var sentRev = (+meta.rev || 0), sentAt = meta.updatedAt;
    post({ op: 'putscenario', id: a.id, expectedRev: a.localCloudRev, scenarioRev: (+meta.rev || 0),
           record: input, mid: mid, clientMeta: { build: buildTag() } }, function(res, err){
      if (err || !res){ rep.ok = false; rep.errors.push({ id: a.id, code: err || 'NO_RESPONSE' }); next(); return; }
      if (res.status === 200 && res.j && res.j.ok === true){
        /* ★S-4b: 送っている間に同じシナリオがもう一度保存されていたら、cloudRev だけ進めて dirty は残す（次の同期で送る） */
        var now = metaOf(a.id);
        var moved = !!(now && ((+now.rev || 0) !== sentRev || now.updatedAt !== sentAt));
        var m = st.f872MarkPushed(a.id, cloudRevOfRow(res.j), (moved || res.j.created === true) ? { keepDirty: moved, registeredAt: (res.j.created === true) ? (+res.j.updatedAt || 0) : 0 } : undefined);   /* ★SC-DATE: クラウドに初めて作られた時刻（server の updatedAt） */
        if (!m.ok){ rep.ok = false; rep.errors.push({ id: a.id, code: m.code || 'MARK_FAILED' }); }
        else { rep.pushed++; rep.pushedIds.push(a.id); if (a.replay) rep.replayed++; }
        next(); return;
      }
      rep.ok = false;
      var code = (res.j && res.j.errorCode) || ('HTTP_' + res.status);
      /* ★409 は **自動解決しない**。UI へ渡して Owner に 2 択を出す。
         ★S-4b: idem-key-reuse（同じ mid・違う内容版）も衝突として扱う（上書きしない）。 */
      if (res.status === 409 && (code === 'scenario-rev-mismatch' || code === 'scenario-exists' || code === 'scenario-deleted' || code === 'idem-key-reuse')){
        var cf = { id: a.id, action: 'CONFLICT', errorCode: code,
                   localCloudRev: a.localCloudRev, remoteCloudRev: (res.j && res.j.serverRev) || 0,
                   remoteScenarioRev: (res.j && res.j.serverScenarioRev) || 0, dirty: true,
                   localDeleted: !!a.localDeleted,
                   /* ★409 scenario-deleted も「remote で削除された」衝突として UI へ渡す（文面が変わる） */
                   remoteDeleted: (code === 'scenario-deleted'),
                   why: 'server が 409 を返した（書き込み 0）' };
        rep.conflicts.push(cf); notifyConflict(cf, opts); next(); return;
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
  function notifyConflict(info, opts){
    /* ★S-4b: 自動同期の衝突は記録だけ（HOME で急に 2 択を出さない）。シナリオを開いた時・始める時に fix825 が 2 択を出す。
       保存・開始など、その ID を利用者がいま操作している時（interactiveIds）はその場で出す。 */
    if (opts && opts.quietConflicts && !(opts.interactiveIds && info && opts.interactiveIds[String(info.id)])){
      try { console.log(TAG, 'CONFLICT recorded (shown when the scenario is opened)', info && info.id); } catch(e){}
      return;
    }
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
      else applied = st.f872ApplyRemote(id, inputFromRecord(res.j.record), cloudRevOfRow(res.j), +res.j.scenarioRev || 0, +res.j.updatedAt || 0);   /* ★SC-DATE */
      if (!applied.ok) return done({ ok: false, code: applied.code || 'APPLY_FAILED', forkedTo: forked });
      delete S.conflicts[id];
      /* ★S-4b: 解決した結果（新しい ID の写し）を 1 回だけ送る（自動同期が有効な時だけ） */
      if (autoActive()){ try { requestSync('resolve', {}); } catch(eR){} }
      return done({ ok: true, id: id, choice: choice, forkedTo: forked, cloudRev: applied.cloudRev });
    });
  }

  /* ================= ★★S-4b 自動同期の orchestrator（GPT #127-FT） =================
     ・きっかけ: home（1 ページ 1 回）/ save / delete / list（直近に成功していれば省く）/ start（その 1 本）/ resolve / manual
     ・同時に 1 本だけ。走っている間に来たきっかけは 1 本にまとめて、終わった後に 1 回だけ走らせる（タイマーの再試行は無い）。
     ・送る物: stampOk（作成時の持ち主＝いまのアカウント）＋ 呼び手が明示した extraAllow（fix966 の手動選択）だけ。 */
  var AUTO = { homeDone: false, running: false, queue: [], runs: 0, lastDoneAt: 0, lastOk: null, lastCode: null, lastReason: null, log: [] };
  function editingId(){ try { var U = window.__v292Dfix825; var s = U && U.state && U.state(); return (s && s.view === 'SC_EDIT' && s.scenarioId) ? String(s.scenarioId) : null; } catch(e){ return null; } }
  function requestSync(reason, o, cb){
    o = o || {};
    if (killed()){ if (cb) cb({ ok: false, code: 'KILLED' }); return false; }
    if (!autoActive()){ if (cb) cb({ ok: false, code: autoOff() ? 'AUTO_OFF' : 'NOT_ELIGIBLE' }); return false; }
    if (o.minGapMs > 0 && (AUTO.running || AUTO.queue.length || (AUTO.lastOk && (Date.now() - AUTO.lastDoneAt) < o.minGapMs))){
      if (cb) cb({ ok: true, skipped: AUTO.running || AUTO.queue.length ? 'RUNNING' : 'RECENT' }); return false;
    }
    AUTO.queue.push({ reason: String(reason || ''), o: o, cb: cb || null });
    setTimeout(pump, 0);      /* 呼び手の local 書込（保存・削除）が確定してから走らせる */
    return true;
  }
  function pump(){
    if (AUTO.running || !AUTO.queue.length) return;
    var batch = AUTO.queue.splice(0, AUTO.queue.length);
    var only = null, full = false, tmo = 0, inter = {}, extras = [], reasons = [];
    for (var i = 0; i < batch.length; i++){
      var b = batch[i].o; reasons.push(batch[i].reason);
      if (b.onlyId){ if (only === null) only = String(b.onlyId); else if (only !== String(b.onlyId)) full = true; } else full = true;
      if (b.timeoutMs > 0) tmo = tmo ? Math.min(tmo, b.timeoutMs) : b.timeoutMs;
      if (b.interactiveId) inter[String(b.interactiveId)] = 1;
      if (typeof b.extraAllow === 'function') extras.push(b.extraAllow);
    }
    if (full) only = null;
    var acct = serverAccount();
    if (!acct || killed() || autoOff()){
      var r0 = { ok: false, code: killed() ? 'KILLED' : (autoOff() ? 'AUTO_OFF' : 'NOT_ELIGIBLE') };
      for (var k0 = 0; k0 < batch.length; k0++){ try { if (batch[k0].cb) batch[k0].cb(r0); } catch(e){} }
      return;
    }
    AUTO.running = true; AUTO.runs++;
    var reason = reasons.join('+');
    syncOnce(function(rep){
      AUTO.running = false; AUTO.lastDoneAt = Date.now(); AUTO.lastReason = reason;
      AUTO.lastOk = !!(rep && !rep.code && !(rep.errors && rep.errors.length)); AUTO.lastCode = rep ? (rep.code || (rep.errors && rep.errors.length ? rep.errors[0].code : null)) : 'NO_REPORT';
      var sum = summary(rep, reason);
      AUTO.log.push(sum); if (AUTO.log.length > 20) AUTO.log.shift();
      try { console.log(TAG, 'auto sync', JSON.stringify(sum)); } catch(e){}
      try { window.dispatchEvent(new CustomEvent('chr:scenario-sync', { detail: sum })); } catch(e){}
      for (var k = 0; k < batch.length; k++){ try { if (batch[k].cb) batch[k].cb(rep || { ok: false, code: 'NO_REPORT' }); } catch(e){} }
      setTimeout(pump, 0);
    }, { expectAccount: acct, onlyId: only, timeoutMs: tmo, quietConflicts: true, interactiveIds: inter, replayConflicts: true, ownerGuard: true,
         pushAllow: function(id){ if (stampOk(id)) return true; for (var x = 0; x < extras.length; x++){ try { if (extras[x](id)) return true; } catch(e){} } return false; },
         skipPull: function(id){ return !inter[String(id)] && editingId() === String(id); } });
  }
  function summary(rep, reason){
    rep = rep || {};
    return { reason: reason, at: Date.now(), ok: !rep.code && !(rep.errors && rep.errors.length), code: rep.code || null, why: rep.why || null,
             pushed: rep.pushed || 0, pulled: rep.pulled || 0, adopted: rep.adopted || 0, replayed: rep.replayed || 0,
             deletedLocal: rep.deletedLocal || 0, deletedRemote: rep.deletedRemote || 0,
             conflicts: (rep.conflicts || []).map(function(c){ return c.id; }), errors: (rep.errors || []).length,
             errorCodes: (rep.errors || []).map(function(e){ return e.code; }).slice(0, 5),
             held: (rep.held || []).length, deferred: rep.deferred || 0, notApproved: rep.skippedNotApproved || 0,
             pulledIds: rep.pulledIds || [], deletedLocalIds: rep.deletedLocalIds || [], onlyId: rep.onlyId || null };
  }
  /* HOME を開いた時の 1 回（/auth/me の答えが来てから・DOM ができてから。二重に始めない） */
  function homeTrigger(){
    if (AUTO.homeDone) return;
    if (document.readyState === 'loading') return;      /* DOMContentLoaded でもう一度呼ばれる */
    if (!autoActive()) return;                          /* /auth/me の答えが来たら chr:account-me でもう一度呼ばれる */
    AUTO.homeDone = true;
    requestSync('home', {});
  }
  try { window.addEventListener('chr:account-me', homeTrigger, false); } catch(e){}
  try { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', homeTrigger, false); else setTimeout(homeTrigger, 0); } catch(e){}

  /* 物語を始める直前の照合（その 1 本だけ）。cb({ ok, block?, unsynced?, code?, conflict? })
       block 'CONFLICT' … 未解決の衝突（始めない。2 択を出す）
       block 'DELETED'  … 別の端末で削除された（始めない）
       block 'UPDATED'  … 別の端末の新しい版を取り込んだ（始めない。内容を確かめてから押し直す）
       unsynced         … 通信できない等で照合できなかった（この端末の版で始めてよい。未同期を表示する） */
  function preStart(id, cb){
    id = String(id || '');
    var fired = false, guard = null;
    var fin = function(r){ if (fired) return; fired = true; if (guard) clearTimeout(guard); try { cb(r); } catch(e){} };
    if (S.conflicts[id]) return fin({ ok: false, block: 'CONFLICT', conflict: S.conflicts[id], code: 'KNOWN_CONFLICT' });
    if (!autoActive()) return fin({ ok: true, skipped: true, code: killed() ? 'KILLED' : (autoOff() ? 'AUTO_OFF' : 'NOT_ELIGIBLE') });
    /* 照合がどうしても返らない時の上限（通信できない時に始められなくしない）。この時は未同期として始める */
    guard = setTimeout(function(){ fin({ ok: true, unsynced: true, code: 'TIMEOUT' }); }, START_TIMEOUT_MS * 4);
    var queued = requestSync('start', { onlyId: id, timeoutMs: START_TIMEOUT_MS, interactiveId: id }, function(rep){
      var st = ST();
      if (S.conflicts[id]) return fin({ ok: false, block: 'CONFLICT', conflict: S.conflicts[id], rep: rep });
      var rd = st ? st.read(id) : null;
      if (rd && !rd.ok && rd.code === 'NOT_FOUND') return fin({ ok: false, block: 'DELETED', rep: rep });
      if (rep && rep.pulledIds && rep.pulledIds.indexOf(id) >= 0) return fin({ ok: false, block: 'UPDATED', rep: rep });
      if (!rep || rep.code || (rep.errors && rep.errors.length)) return fin({ ok: true, unsynced: true, code: (rep && (rep.code || (rep.errors && rep.errors[0] && rep.errors[0].code))) || 'SYNC_INCOMPLETE', rep: rep });
      if ((rep.held && rep.held.length) || rep.deferred) return fin({ ok: true, unsynced: true, code: 'HELD', rep: rep });
      fin({ ok: true, rep: rep });
    });
    if (!queued && !fired) fin({ ok: true, skipped: true, code: 'NOT_QUEUED' });
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
    /* ★S-4b 自動同期 */
    autoActive: autoActive,
    requestSync: requestSync,
    preStart: preStart,
    canAutoSend: stampOk,
    accountOk: function(a){ return !!a && !accountHold(String(a)); },   /* ★#127-FV: ☁ で登録する時のアカウント再確認（server の答え・端末の印・iso2 がそろっているか） */
    conflictOf: function(id){ var c = S.conflicts[String(id || '')]; return c ? JSON.parse(JSON.stringify(c)) : null; },
    autoState: function(){ var a = serverAccount();
      return { active: autoActive(), killed: killed(), autoOff: autoOff(), account: a ? ('…' + a.slice(-6)) : null, homeDone: AUTO.homeDone,
               running: AUTO.running, queued: AUTO.queue.length, runs: AUTO.runs, lastDoneAt: AUTO.lastDoneAt, lastOk: AUTO.lastOk,
               lastCode: AUTO.lastCode, lastReason: AUTO.lastReason, log: JSON.parse(JSON.stringify(AUTO.log)),
               capability: { checked: CAP.checked, supported: CAP.supported, netFails: CAP.netFails } }; },
    conflicts: function(){ var o = [], k; for (k in S.conflicts){ if (Object.prototype.hasOwnProperty.call(S.conflicts, k)) o.push(S.conflicts[k]); } return o; },
    state: function(){
      return { version: VERSION, enabled: enabled(), killed: killed(), running: S.running,
               loggedIn: isLoggedIn(), proxyUrl: proxyUrl(), capability: { checked: CAP.checked, supported: CAP.supported },
               storeReady: !!(ST() && ST().f872On && ST().f872On()),
               lastReport: S.lastReport, conflictCount: (function(){ var n = 0, k; for (k in S.conflicts) n++; return n; })(),
               /* ★S-4b: ログイン中（owner / beta）は HOME 表示・保存・削除・開始の直前に自動で同期する。kill / AutoOff で止まる。 */
               autoSync: autoActive() };
    }
  };
  try {
    console.log(TAG, 'loaded ('
      + (killed() ? 'KILLED v292Dfix872Off=1' : (lsg('v292Dfix872On') === '1' ? 'ENABLED (v292Dfix872On=1)' : (autoOff() ? 'auto OFF (v292Dfix872AutoOff=1)' : 'auto: ON after /auth/me (owner/beta)')))
      + '; S-4b automatic triggers: home / save / delete / start)');
  } catch(e){}
})();
