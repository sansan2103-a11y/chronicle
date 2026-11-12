/* =====================================================================
 * v292DfixSTORE1b-device-free.js — HOME「この端末の空き容量を増やす」（GPT #127-SG B Q1〜Q9 ＋ #127-SI R1〜R3）
 * ---------------------------------------------------------------------
 * ■r2（#127-SI）で足したこと
 *   R1① 排他 Web Lock: 消す物語ごとに 'chronicle:story-open:<id>' を exclusive・ifAvailable で取り、最後のキーを消すまで持つ。
 *       取れなければその物語は中止（open-in-tab）。取った後に /api/auth/me・墓標（ローカルの関門）・getstory・キーと値を取り直す。
 *       取得順はどこでも「story-open:<id> → chronicle:cc2:materialization:v1」。どちらも ifAvailable（待たない）なので循環待ちは起きない。
 *       ほかの持ち主: SOL1 は story-open だけ（shared）、fix745 / JR1 は materialization だけ。2 つを同時に持つのは STORE1b だけ。
 *   R1② 内容の一致: 端末の本文の turns[i] を Worker / fix697 と同じ canonical serialization（stableStringify＝キー順・undefined 落とし）で
 *       文字列にし、サーバーの record.body.turns[i] と 1 文字ずつ同じであること（i = 0 … 端末のターン数−1）。端末の方が多い → server-body-behind、
 *       1 つでも違う → content-mismatch。サーバーの方が多いのはよい（端末の写しはその前半）。getstory の返事をそのまま使う（通信は増えない）。
 *       本文・ハッシュはログに書かない（件数と理由コードだけ）。
 *   R2 Vault: chr6_vault_hidden.visible は理由にしない。hidden・fix889 isHidden/hiddenIds・passcode（storysess）・サーバーの locked・
 *       Vault の状態が読めない/揃わない（fix889 が無い・canonState が ready でない・cache が壊れている）・別アカウントの印 は止める。どれも本文を読む前。
 *   R3 まとめて（既定 OFF・localStorage v292DfixSTORE1Multi='1' のときだけ）: 最大 10 件を選び、合計件数と文字数を見て 1 回確認 →
 *       1 件ずつ独立に（関門・認証・墓標・内容一致・排他 Lock・キーと値）消す。1 件失敗したらそこで止める（再試行しない）。
 *       結果は「消した / 止まった（理由コード） / 手を付けていない」の 3 つの数。
 * ■何をするか
 *   サーバーで削除が確定した物語（この端末の一覧からはもう外れている＝meta に墓標がある）について、
 *   この端末に残った本文とサイドストアを、Owner が選んだ物語だけ、1 件ずつ確認してから消す。
 *   ・DL2「一覧から削除」の契約と文言は変えない（あちらは今までどおり墓標だけ・控えは残す）。別の明示操作として置く（Q1）。
 *   ・HOME を開いただけでは何も消さない（Q5）。v292DfixSTORE1Dry='1' のときだけ、開いたあと 1 回、消さずに数えて記録する（dry-run）。
 *   ・snapshot（削除済み・復元用・生きている物語のもの）は消さない。数えるだけ（Q6/Q7）。
 *   ・getstory が 404 の物語、サーバーでは生きている（v1 墓標の）物語は触らない（Q8）。
 *   ・旧 id a/b/c/default（と id の形が s+英数 8〜10 でないもの）は対象にしない。値も読まない。Vault に関わる物語も同じ（値を読む前に判定）。
 *
 * ■消してよい物語（全部満たすときだけ。1 つでも判定できなければ消さない）
 *   L1 id の形 /^s[0-9a-z]{8,10}$/・保護 id でない
 *   L2 Vault に関わらない（chr6_vault_hidden の hidden・fix889 isHidden/hiddenIds・chr6_storysess_<id>（local/session）。visible は見ない。
 *      fix889 が無い・canonState が ready でない・cache が壊れている → 全部止める）。
 *      隠した物語は getstory も「無い」と同じ形で答える（DL2 の注記）ので、S2 でも 404 として止まる（二重）
 *   L3 meta にその id の墓標がちょうど 1 行・生きた行なし
 *   L4 iso2 が別アカウントを示さない
 *   L5 開かれていない: chr6_active_slot ≠ id・lastOpenedAt 10 分以内でない・
 *      Web Lock 'chronicle:story-open:<id>'（物語画面が持つ・v292DfixSOL1）を navigator.locks.query() で見て誰も持っていない／待っていない。
 *      Locks API が無ければ対象外（locks-unavailable）（Q9）
 *   L6 未送信なし: f781g が DIRTY_INTENT・DIRTY_LOCAL・DIVERGED・BOOTSTRAP_HOLD・送信中・読めない でない・f911/f697p/945_rescue なし・dl2conflict なし・
 *      fix750 journal が指していない・未解決の fix587 計画なし・fix721 復元中でない
 *   S1 同じ実行の中で、/api/auth/me（前）→ getstory(id) → /api/auth/me（後）の accountId が同じで空でない
 *   S2 getstory が 200・ok・id 一致・deleted===true・authority∈{shadow,canonical}・locked でない
 *   S3 サーバーの行が本文を持っている（Q3）: record.deleted===true・record.body.turns が配列で 1 件以上（無ければ server-body-not-held）
 *   S4 内容の一致（#127-SI R1②）: 端末の turns[i] とサーバーの turns[i] の canonical 文字列がすべて同じ（上の r2 の説明）。
 *      端末の本文が読めない → local-body-unreadable・本体が無いのにサイドが残る → local-body-missing
 *
 * ■消すキー: KEY1（v292DfixKEY1-story-key.js）で「その id の既知 family」と完全一致するものだけ。
 *   本体 chr6_slot_<id>・サイドストア・__gen_chr6_slot_<id>・最後に v292Dfix402_f781g_<id>（同期の印）。
 *   snapshot・控え（chr6_bk_）・形の分からないキー・meta の墓標は残す（数だけ数える）。
 *
 * ■証拠（Q2）: accountId（前後）・storyId・server rev・deleted===true・authority・本文保持・キーの一覧・計画時の値を
 *   1 つの proof にまとめ、メモリだけで持つ（meta の形式は変えない）。fix562.store1Arm で登録 → deletePolicy の
 *   'device-free' verified 許可（Q4）→ fix569 tryDeleteExact（exact + bytes/hash）で 1 キーずつ消す → finally で store1Disarm。
 *   消す前に Web Lock chronicle:story-open:<id>（exclusive・ifAvailable）を取り、その中で /api/auth/me・ローカルの関門・キーと値・
 *   getstory（S2〜S4）・/api/auth/me をやり直してから、chronicle:cc2:materialization:v1（exclusive・ifAvailable）の中で同期のまま
 *   もう一度関門とキーと値を確かめて消す。どこかで 1 つでも違えば何も消さない。
 *
 * ■記録 v292DfixSTORE1Log（best-effort。書けなければメモリだけ。操作の安全はログに依存しない）:
 *   件数・文字数・理由コードの件数だけ。消さなかった物語の id は書かない。消した物語だけ id と件数・文字数（題名・値は書かない）。
 *
 * kill: localStorage v292DfixSTORE1Off='1' → 入口を出さない・何もしない（読むのはこのキー 1 本だけ）。
 * 観測: window.__v292DfixSTORE1b.status() / .dryRun()（消さない）
 * ===================================================================== */
(function (root) {
  'use strict';
  var VERSION = 'STORE1b-r2';
  var KILL = 'v292DfixSTORE1Off', DRY = 'v292DfixSTORE1Dry', MULTI = 'v292DfixSTORE1Multi', LOGK = 'v292DfixSTORE1Log', LOG_RUNS = 10;
  var MAX_MULTI = 10;
  var ID_RE = /^s[0-9a-z]{8,10}$/;
  var PROTECT = { smv6r10s7u9: 1 };                      /* DL2 と同じ表示用の保護 */
  var RECENT_OPEN_MS = 10 * 60 * 1000;
  var OPEN_LOCK = 'chronicle:story-open:', MAT_LOCK = 'chronicle:cc2:materialization:v1';
  var UNSYNCED_STATES = { DIRTY_INTENT: 1, DIRTY_LOCAL: 1, DIVERGED: 1, BOOTSTRAP_HOLD: 1 };
  var NOTICE = 'この端末に保存された控えが消えます。現時点では削除済み物語を一覧へ戻す機能はありません';

  function J(s, d) { try { var v = JSON.parse(s); return v === undefined ? d : v; } catch (e) { return d; } }
  function isArr(a) { return Object.prototype.toString.call(a) === '[object Array]'; }
  function g(env, k) { try { return env.ls.getItem(k); } catch (e) { return null; } }
  function allKeys(env) { var out = [], n = env.ls.length; for (var i = 0; i < n; i++) { var k = env.ls.key(i); if (typeof k === 'string') out.push(k); } return out; }
  function bump(m, k) { m[k] = (m[k] || 0) + 1; }
  /* canonical serialization: Worker chrStableStringify / fix697 stableStringify と同じ規約（キーを並べ替え・undefined のキーは落とす・配列はそのまま） */
  function stable(v) {
    if (v === undefined) return 'null';
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (isArr(v)) { var a = '['; for (var i = 0; i < v.length; i++) a += (i ? ',' : '') + stable(v[i]); return a + ']'; }
    var ks = []; for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) ks.push(k); ks.sort();
    var o = ''; for (var j = 0; j < ks.length; j++) { if (v[ks[j]] === undefined) continue; o += (o ? ',' : '') + JSON.stringify(ks[j]) + ':' + stable(v[ks[j]]); }
    return '{' + o + '}';
  }
  function h53(str) {   /* proof に載せる要約だけに使う（一致の判定は文字列そのものの比較）。ログには出さない */
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0; i < str.length; i++) { var c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h2 >>> 0).toString(16) + ':' + (h1 >>> 0).toString(16);
  }

  /* ---- 消すキー（KEY1 の完全一致だけ）と、残すものの数（名前だけで数える・値は読まない） ---- */
  function keysFor(id, env) {
    var r = { side: [], body: [], marker: [], snapshots: 0, backupKept: 0, unknownKept: 0, refused: 0 };
    var K = env.key1; if (!K || !ID_RE.test(String(id))) return r;
    var ks = allKeys(env);
    for (var i = 0; i < ks.length; i++) {
      var k = ks[i], s = K.storyOf(k);
      if (s && s.id === id) {
        if (s.kind === 'snapshot') { r.snapshots++; continue; }
        if (s.kind === 'vault' || s.kind === 'rescue') { r.refused++; continue; }   /* 関門で止まる（ここに来たら消さない） */
        if (s.kind === 'body') r.body.push(k);
        else if (k === 'v292Dfix402_f781g_' + id) r.marker.push(k);
        else if (s.kind === 'sync') { r.refused++; continue; }                      /* f911 / f697p（未送信の印）は消さない */
        else r.side.push(k);
        continue;
      }
      if (!K.mentions(k, id)) continue;
      if (k.indexOf('chr6_bk_') === 0) r.backupKept++; else r.unknownKept++;
    }
    r.side.sort();
    return r;
  }
  function purgeList(kf) { return kf.side.concat(kf.body, kf.marker); }   /* サイド → 本体 → 同期の印 */

  /* ---- ローカルの関門（L1〜L6）。理由コード。null = 通過 ---- */
  function metaRows(env) { var a = J(g(env, 'chr6_slots_meta') || '[]', null); return isArr(a) ? a : null; }
  function vaultBlock(id, env) {
    var vh = g(env, 'chr6_vault_hidden');
    if (vh != null) {
      var v = J(vh, null); if (!v || typeof v !== 'object' || isArr(v)) return 'vault-cache-unreadable';
      if (v.hidden !== undefined && !isArr(v.hidden)) return 'vault-cache-unreadable';
      /* R2: hidden（隠している物語）だけを見る。visible は「サーバーが見せてよいと言った物語」の一覧（fix889 writeCache）で、
         ほぼ全部の物語が入るので単独では理由にしない（#127-SI R2）。 */
      if (isArr(v.hidden)) for (var j = 0; j < v.hidden.length; j++) if (String(v.hidden[j]) === id) return 'vault';
    }
    try {
      var F = env.vault;
      if (!F || typeof F.isHidden !== 'function' || typeof F.hiddenIds !== 'function') return 'vault-unavailable';
      if (F.isHidden(id)) return 'vault';
      var hs = F.hiddenIds(); if (!isArr(hs)) return 'vault-state-unknown';
      for (var h = 0; h < hs.length; h++) if (String(hs[h]) === id) return 'vault';
    } catch (e) { return 'vault-check-threw'; }
    if (g(env, 'chr6_storysess_' + id) != null) return 'passcode';
    try { if (env.ss && env.ss.getItem('chr6_storysess_' + id) != null) return 'passcode'; } catch (e2) { return 'vault-check-threw'; }
    return null;
  }
  function localBlock(id, env) {
    id = String(id);
    if (!ID_RE.test(id)) return 'id-shape';                              /* L1: a/b/c/default/chr6 はここ（値を読まない） */
    if (PROTECT[id] === 1) return 'protected';
    var vb = vaultBlock(id, env); if (vb) return vb;                      /* L2: 値を読む前 */
    var meta = metaRows(env); if (!meta) return 'meta-unreadable';
    var tomb = 0, live = 0, row = null;
    for (var i = 0; i < meta.length; i++) { var e = meta[i]; if (!e || String(e.id) !== id) continue; if (e.deleted === true) { tomb++; row = e; } else live++; }
    if (live) return 'live-row';                                          /* L3 */
    if (tomb !== 1) return tomb ? 'dup-tombstone' : 'no-tombstone';
    try { if (env.iso2Foreign && env.iso2Foreign(id)) return 'foreign'; } catch (e3) { return 'foreign-check-threw'; }   /* L4 */
    var act = g(env, 'chr6_active_slot');                                  /* L5 */
    if (act != null && (act === id || J(act, null) === id)) return 'active-slot';
    var lo = row && row.lastOpenedAt ? Date.parse(row.lastOpenedAt) : 0;
    if (lo && env.now() - lo < RECENT_OPEN_MS) return 'recently-opened';
    var mk = g(env, 'v292Dfix402_f781g_' + id);                            /* L6 */
    if (mk != null) {
      var mo = J(mk, null); if (!mo || typeof mo !== 'object') return 'marker-unreadable';
      if (UNSYNCED_STATES[String(mo.state || '')] === 1) return 'unsynced';
      if (mo.inFlightSave) return 'in-flight';
      if (mo.storyId != null && String(mo.storyId) !== id) return 'marker-id-mismatch';
    }
    if (g(env, 'v292Dfix402_f911_' + id) != null) return 'stash';
    if (g(env, 'v292Dfix402_f697p_' + id) != null) return 'journal';
    if (g(env, 'v292Dfix945_rescue_' + id) != null) return 'rescue';
    var cf = g(env, 'v292Dfix587_dl2conflict');
    if (cf != null) { var co = J(cf, null); if (!co || typeof co !== 'object') return 'conflict-unreadable'; if (Object.prototype.hasOwnProperty.call(co, id)) return 'conflict'; }
    var mt = g(env, 'v292Dfix750_matTxn');
    if (mt != null) { var to = J(mt, null); if (!to || typeof to !== 'object') return 'mat-journal-unreadable'; if (String(to.storyId) === id || String(to.slotId) === id) return 'mat-journal'; }
    var pd = g(env, 'v292Dfix587_pending');
    if (pd != null) {
      var pa = J(pd, null); if (!isArr(pa)) return 'pending-unreadable';
      for (var p = 0; p < pa.length; p++) {
        var pl = pa[p]; if (!pl) continue;
        if (String(pl.slotId) !== id && String(pl.storyId || '') !== id) continue;
        if (!(pl.sdTerminal === true && (pl.sdResolution === 'SERVER_TOMBSTONED_BY_DL2' || pl.sdResolution === 'SERVER_TOMBSTONED_BY_LDR'))) return 'delete-plan-open';
      }
    }
    return null;
  }
  function globalBlock(env) {
    if (!env.key1) return 'key1-unavailable';
    /* R2: Vault の状態が読めない・揃わない → 全部止める（値は読まない） */
    var F = env.vault;
    if (!F || typeof F.isHidden !== 'function' || typeof F.hiddenIds !== 'function' || typeof F.canonState !== 'function') return 'vault-unavailable';
    try { if (F.canonState() !== 'ready') return 'vault-state-unknown'; } catch (eV) { return 'vault-state-unknown'; }
    if (g(env, 'v292DfixSOL1Off') === '1') return 'open-lock-off';        /* 物語画面が Lock を持たない設定では「開いていない」を確かめられない */
    var tx = g(env, 'v292Dfix721_txn');
    if (tx != null) { var t = J(tx, null); if (!t || typeof t !== 'object' || /PREPARED|APPLYING/.test(String(t.state || t.phase || ''))) return 'restore-hold'; }
    return null;
  }
  function candidates(env) {
    var meta = metaRows(env) || [], seen = {}, out = [];
    for (var i = 0; i < meta.length; i++) { var e = meta[i]; if (!e || e.deleted !== true || e.id == null) continue; var id = String(e.id); if (seen[id]) continue; seen[id] = 1; out.push(id); }
    return out;
  }
  function titleOf(id, env) { var m = metaRows(env) || []; for (var i = 0; i < m.length; i++) if (m[i] && String(m[i].id) === id && m[i].deleted === true) return String(m[i].title || m[i].name || '') || null; return null; }

  /* ---- 計画（その物語の消すキーと、いまの値）。L1〜L6 を通った物語だけで呼ぶ ---- */
  /* 端末の本文: present（turns が配列）/ absent（本体が無い）/ unreadable。present のとき各ターンの canonical 文字列（メモリだけ） */
  function planOne(id, env) {
    var kf = keysFor(id, env), list = purgeList(kf), vals = [], chars = 0, turns = null, body = 'absent', tstr = null;
    for (var i = 0; i < list.length; i++) { var v = g(env, list[i]); vals.push(v); chars += list[i].length + (v == null ? 0 : v.length); }
    var bi = list.indexOf('chr6_slot_' + id);
    if (bi >= 0) {
      var b = J(vals[bi], null);
      if (b && typeof b === 'object' && !isArr(b) && isArr(b.turns)) {
        body = 'present'; turns = b.turns.length; tstr = [];
        try { for (var t = 0; t < b.turns.length; t++) tstr.push(stable(b.turns[t])); } catch (eS) { body = 'unreadable'; tstr = null; turns = null; }
      } else body = 'unreadable';
    }
    return { id: id, keys: list, vals: vals, chars: chars, turns: turns, body: body, tstr: tstr, snapshots: kf.snapshots, backupKept: kf.backupKept, unknownKept: kf.unknownKept, refused: kf.refused };
  }
  /* 本文を確かめられない写しは消さない。本体が無く残りが同期の印だけ（前回の途中で止まった続き）のときだけ、照合するターンが 0 件として通す */
  function bodyBlock(pl) {
    if (pl.body === 'unreadable') return 'local-body-unreadable';
    if (pl.body === 'absent') { for (var i = 0; i < pl.keys.length; i++) if (pl.keys[i] !== 'v292Dfix402_f781g_' + pl.id) return 'local-body-missing'; }
    return null;
  }
  /* ---- サーバー（S2/S3） ---- */
  function serverEval(id, r, pl) {
    if (!r || typeof r !== 'object') return { why: 'server-unreachable' };
    if (r.status === 404) return { why: 'server-404' };
    if (r.status !== 200) return { why: 'server-unreachable' };
    var j = r.j || {};
    if (j.ok !== true) return { why: 'server-not-ok' };
    if (j.id == null || String(j.id) !== String(id)) return { why: 'server-id-mismatch' };
    if (j.authority !== 'shadow' && j.authority !== 'canonical') return { why: 'server-authority' };
    if (j.locked) return { why: 'server-locked' };
    if (j.deleted !== true) return { why: 'server-live' };
    if (typeof j.rev !== 'number' || !(j.rev >= 1)) return { why: 'server-rev' };
    var rec = j.record, b = rec && rec.body;
    if (!rec || rec.deleted !== true || !b || !isArr(b.turns) || b.turns.length < 1) return { why: 'server-body-not-held' };
    /* R1②: 端末のターンが全部、同じ位置に同じ内容で（canonical 文字列が 1 文字も違わずに）サーバーにある */
    var loc = (pl && pl.body === 'present' && isArr(pl.tstr)) ? pl.tstr : [];
    if (pl && pl.body === 'present' && !isArr(pl.tstr)) return { why: 'local-body-unreadable' };
    if (b.turns.length < loc.length) return { why: 'server-body-behind' };
    var dig = [];
    try { for (var i = 0; i < loc.length; i++) { var sv = stable(b.turns[i]); if (sv !== loc[i]) return { why: 'content-mismatch' }; dig.push(h53(sv)); } }
    catch (eC) { return { why: 'content-mismatch' }; }
    return { why: null, rev: j.rev, authority: j.authority, serverTurns: b.turns.length, localTurns: loc.length, digest: h53(dig.join(',')) };
  }

  /* ---- 一覧（何も消さない）: 候補ごとに L1〜L6 → 計画 → getstory → Lock の確認、前後の accountId ---- */
  function survey(env, ctx) {
    var rep = { at: env.now(), v: VERSION, kind: 'survey', candidates: 0, eligible: [], skipped: {}, totals: { stories: 0, keys: 0, chars: 0, snapshotsKept: 0, backupKept: 0, unknownKept: 0 } };
    var gb = globalBlock(env);
    if (gb) { bump(rep.skipped, gb); return Promise.resolve(rep); }
    var ids = candidates(env), pass = [];
    rep.candidates = ids.length;
    for (var i = 0; i < ids.length; i++) { var w = localBlock(ids[i], env); if (w) { bump(rep.skipped, w); continue; } pass.push(ids[i]); }
    if (!pass.length) return Promise.resolve(rep);
    return Promise.resolve(ctx.who()).then(function (a0) {
      if (!a0) { bump(rep.skipped, 'no-account'); return rep; }
      var rows = [], chain = Promise.resolve();
      pass.forEach(function (id) {
        chain = chain.then(function () {
          var pl = planOne(id, env);
          if (!pl.keys.length) { bump(rep.skipped, 'nothing-left'); return; }
          var bb = bodyBlock(pl); if (bb) { bump(rep.skipped, bb); return; }
          return Promise.resolve(ctx.getStory(id)).then(function (r) {
            var se = serverEval(id, r, pl);
            if (se.why) { bump(rep.skipped, se.why); return; }
            return Promise.resolve(ctx.lockHeld(id)).then(function (h) {
              if (h !== false) { bump(rep.skipped, h === true ? 'open-in-tab' : 'locks-unavailable'); return; }
              rows.push({ id: id, title: titleOf(id, env), turns: pl.turns, keys: pl.keys.length, chars: pl.chars, snapshots: pl.snapshots, backupKept: pl.backupKept, unknownKept: pl.unknownKept, serverRev: se.rev, authority: se.authority });
            });
          }, function () { bump(rep.skipped, 'server-unreachable'); });
        });
      });
      return chain.then(function () { return ctx.who(); }).then(function (a1) {
        if (!a1 || a1 !== a0) { rep.eligible = []; bump(rep.skipped, 'principal-changed'); return rep; }
        rep.eligible = rows;
        rows.forEach(function (x) { rep.totals.stories++; rep.totals.keys += x.keys; rep.totals.chars += x.chars; rep.totals.snapshotsKept += x.snapshots; rep.totals.backupKept += x.backupKept; rep.totals.unknownKept += x.unknownKept; });
        return rep;
      });
    });
  }

  /* ---- 1 物語を消す（Owner が選んで確認したときだけ） ----
   * 順番: ローカルの関門 → 計画 → me(a0) → locks.query（誰か持っていれば止める）→
   *   [story-open:<id> exclusive・ifAvailable を取る。取れなければ open-in-tab]
   *     me(a1) → 関門の取り直し → キーと値の取り直し → getstory（サーバーの状態と内容の一致）→ me(a2)
   *     [materialization exclusive・ifAvailable を取る。取れなければ lock-busy]
   *       同期で: 関門・キーと値をもう一度 → proof を登録 → 1 キーずつ fix562 → fix569 → finally で proof を捨てる
   *     [materialization を外す]
   *   [story-open を外す] ＝ 最後のキーを消し終わるまで story-open を持つ。例外でもコールバックが終われば必ず外れる。 */
  var runSeq = 0;
  function samePlan(a, b) {
    if (a.keys.join('\n') !== b.keys.join('\n')) return 'keys-changed';
    for (var i = 0; i < a.keys.length; i++) if (a.vals[i] !== b.vals[i]) return 'value-changed';
    return null;
  }
  function freeOne(id, env, ctx) {
    id = String(id);
    var out = { ok: false, code: null, id: id, removed: 0, chars: 0 };
    function fin(code) { out.code = code; return out; }
    var gb = globalBlock(env); if (gb) return Promise.resolve(fin(gb));
    var lb = localBlock(id, env); if (lb) return Promise.resolve(fin(lb));
    var pl = planOne(id, env);
    if (!pl.keys.length) return Promise.resolve(fin('nothing-left'));
    var bb = bodyBlock(pl); if (bb) return Promise.resolve(fin(bb));
    function syncDelete(a0, a2, se, issuedAt) {
      /* materialization も持っている。ここから先は同期だけ（await なし） */
      var gb3 = globalBlock(env) || localBlock(id, env); if (gb3) return fin(gb3);
      var now3 = planOne(id, env), sp3 = samePlan(pl, now3); if (sp3) return fin(sp3);
      var I = env.inv, G = env.gate;
      if (!I || typeof I.deletePolicy !== 'function' || typeof I.store1Arm !== 'function' || typeof I.store1Disarm !== 'function' || typeof I._hash !== 'function') return fin('policy-unavailable');
      if (!G || typeof G.tryDeleteExact !== 'function') return fin('gate-unavailable');
      var proof = { v: 2, kind: 'STORE1', runId: 's1b-' + issuedAt + '-' + (++runSeq), storyId: id, accountId: a0, accountIdAfter: a2,
                    serverRev: se.rev, serverDeleted: true, authority: se.authority, serverBodyHeld: true, issuedAt: issuedAt,
                    contentMatched: true, localTurns: se.localTurns, serverTurns: se.serverTurns, contentDigest: se.digest,
                    keys: pl.keys.map(function (k, j) { return { key: k, bytes: pl.vals[j].length, hash: I._hash(pl.vals[j]), value: pl.vals[j] }; }) };
      var armed = I.store1Arm(proof);
      if (!armed) return fin('arm-refused');
      try {
        for (var q = 0; q < pl.keys.length; q++) {
          var k = pl.keys[q], cur = g(env, k);
          if (cur == null) continue;                                   /* もう無い = 片づけ済み */
          if (cur !== pl.vals[q]) return fin('value-changed-mid');
          var pol = I.deletePolicy({ key: k, value: cur, intent: 'device-free', store1Proof: armed });
          if (!pol || pol.allow !== true || pol.code !== 'device-free-verified-store1') { out.policyWhy = pol && (pol.store1Why || pol.code); return fin('policy-refused'); }
          var b = pol.binding || {};
          if (b.key !== k || b.bytes !== cur.length || b.hash !== I._hash(cur) || b.storyId !== id || b.runId !== armed.runId) return fin('binding-mismatch');
          var rr = null; try { rr = G.tryDeleteExact({ key: k, expectedBytes: cur.length, expectedHash: b.hash, intent: 'device-free', path: 'STORE1b', reason: 'device-free story=' + id }); } catch (eG) { rr = null; }
          if (!rr || rr.ok !== true || rr.deleted !== true || g(env, k) != null) { out.gateCode = rr && rr.code; return fin('gate-refused'); }
          out.removed++; out.chars += k.length + cur.length;
        }
      } finally { try { I.store1Disarm(); } catch (eD) {} }
      out.ok = true; out.snapshotsKept = pl.snapshots; out.backupKept = pl.backupKept; out.unknownKept = pl.unknownKept;
      out.turnsMatched = se.localTurns;
      return fin('freed');
    }
    function underOpenLock(a0) {
      return Promise.resolve(ctx.who()).then(function (a1) {
        if (!a1 || a1 !== a0) return fin('principal-changed');
        var gb2 = globalBlock(env) || localBlock(id, env); if (gb2) return fin(gb2);       /* 墓標・Vault・未送信・開いている印 */
        var now2 = planOne(id, env), sp2 = samePlan(pl, now2); if (sp2) return fin(sp2);
        return Promise.resolve(ctx.getStory(id)).then(function (r) {
          var se = serverEval(id, r, now2);                                                 /* サーバーの状態と内容の一致（Lock の中で） */
          if (se.why) return fin(se.why);
          var issuedAt = env.now();
          return Promise.resolve(ctx.who()).then(function (a2) {
            if (!a2 || a2 !== a0) return fin('principal-changed');
            return Promise.resolve(ctx.withMatLock(function () { return syncDelete(a0, a2, se, issuedAt); })).then(function (m) {
              if (!m || m.granted !== true) return fin(m && m.api === false ? 'locks-unavailable' : 'lock-busy');
              if (m.threw) return fin('threw');
              return m.value;
            });
          });
        }, function () { return fin('server-unreachable'); });
      });
    }
    return Promise.resolve(ctx.who()).then(function (a0) {
      if (!a0) return fin('no-account');
      return Promise.resolve(ctx.lockHeld(id)).then(function (h) {
        if (h !== false) return fin(h === true ? 'open-in-tab' : 'locks-unavailable');
        return Promise.resolve(ctx.withOpenLock(id, function () { return underOpenLock(a0); })).then(function (x) {
          if (!x || x.granted !== true) return fin(x && x.api === false ? 'locks-unavailable' : 'open-in-tab');   /* R1①: 取れない = 誰かが開いている */
          if (x.threw) return fin(out.code && out.code !== 'freed' ? out.code : 'threw');
          return x.value;
        });
      });
    }).then(null, function () { return fin('threw'); });
  }

  /* ---- まとめて（R3・既定 OFF）: 1 件ずつ独立に freeOne。最初の失敗で止める。再試行しない ---- */
  function freeMany(ids, env, ctx, onStep) {
    var res = { ok: false, code: null, total: 0, done: 0, failed: 0, notProcessed: 0, failedCode: null, removed: 0, chars: 0, doneIds: [], partial: 0 };
    if (!isArr(ids) || !ids.length) { res.code = 'nothing-selected'; return Promise.resolve(res); }
    res.total = ids.length;
    if (ids.length > 1 && env.multi !== true) { res.code = 'multi-off'; res.notProcessed = ids.length; return Promise.resolve(res); }
    if (ids.length > MAX_MULTI) { res.code = 'too-many'; res.notProcessed = ids.length; return Promise.resolve(res); }
    var seen = {}; for (var i = 0; i < ids.length; i++) { var s = String(ids[i]); if (seen[s]) { res.code = 'dup-ids'; res.notProcessed = ids.length; return Promise.resolve(res); } seen[s] = 1; }
    var idx = 0;
    function next() {
      if (idx >= ids.length) { res.ok = true; res.code = 'all-freed'; return res; }
      var id = String(ids[idx++]);
      try { if (onStep) onStep(idx, ids.length); } catch (e) {}
      return freeOne(id, env, ctx).then(function (x) {
        if (x && x.ok) { res.done++; res.removed += x.removed; res.chars += x.chars; res.doneIds.push(id); return next(); }
        res.failed = 1; res.failedCode = (x && x.code) || 'threw'; res.partial = (x && x.removed) || 0; res.removed += res.partial; res.chars += (x && x.chars) || 0;
        res.notProcessed = ids.length - idx; res.code = 'stopped';
        return res;
      });
    }
    return Promise.resolve().then(next);
  }

  /* ---- Web Locks（ブラウザでは navigator.locks。試験では同じ意味の偽物を渡す） ----
   * 取得順: chronicle:story-open:<id> → chronicle:cc2:materialization:v1。どちらも ifAvailable:true（待たない）。
   * 戻り値 { granted, value | threw, api }。コールバックの promise が終わると Lock は外れる（例外でも）。 */
  function lockCtx(L) {
    function withLock(name, fn) {
      if (!L || typeof L.request !== 'function') return Promise.resolve({ granted: false, api: false });
      var granted = false;
      return Promise.resolve().then(function () {
        return L.request(name, { mode: 'exclusive', ifAvailable: true }, function (lk) {
          if (!lk) return { granted: false };
          granted = true;
          return Promise.resolve().then(fn).then(function (v) { return { granted: true, value: v }; }, function () { return { granted: true, threw: true }; });
        });
      }).then(function (x) { return x || { granted: false }; }, function () { return { granted: granted, threw: true }; });
    }
    return {
      lockHeld: function (id) {   /* false = 誰も持っていない／待っていない。true = 持っている。null = 確かめられない */
        if (!L || typeof L.query !== 'function' || typeof L.request !== 'function') return null;
        return Promise.resolve().then(function () { return L.query(); }).then(function (q) {
          var nm = OPEN_LOCK + id, a = [].concat((q && q.held) || [], (q && q.pending) || []);
          for (var i = 0; i < a.length; i++) if (a[i] && a[i].name === nm) return true;
          return false;
        }, function () { return null; });
      },
      withOpenLock: function (id, fn) { return withLock(OPEN_LOCK + id, fn); },
      withMatLock: function (fn) { return withLock(MAT_LOCK, fn); }
    };
  }

  /* ---- 記録（best-effort・件数と理由だけ） ---- */
  var memLog = [];
  function writeLog(env, run) {
    memLog.push(run); while (memLog.length > LOG_RUNS) memLog.shift();
    try {
      var o = J(g(env, LOGK) || 'null', null); if (!o || !isArr(o.runs)) o = { v: 1, runs: [] };
      o.runs.push(run); while (o.runs.length > LOG_RUNS) o.runs.shift();
      env.ls.setItem(LOGK, JSON.stringify(o));
      return true;
    } catch (e) { return false; }                                          /* 容量不足など: メモリだけに残す */
  }
  function logOfSurvey(rep, mode) {
    return { at: rep.at, v: VERSION, kind: mode, candidates: rep.candidates, eligible: rep.eligible.length, skipped: rep.skipped,
             keys: rep.totals.keys, chars: rep.totals.chars, snapshotsKept: rep.totals.snapshotsKept, backupKept: rep.totals.backupKept, unknownKept: rep.totals.unknownKept,
             perStoryChars: rep.eligible.map(function (x) { return x.chars; }).sort(function (a, b) { return b - a; }) };
  }

  var api = { version: VERSION, NOTICE: NOTICE, ID_RE: ID_RE, MAX_MULTI: MAX_MULTI, OPEN_LOCK: OPEN_LOCK, MAT_LOCK: MAT_LOCK, keysFor: keysFor, purgeList: purgeList, localBlock: localBlock, candidates: candidates,
              serverEval: serverEval, survey: survey, freeOne: freeOne, freeMany: freeMany, lockCtx: lockCtx, stable: stable,
              writeLog: writeLog, logOfSurvey: logOfSurvey, _memLog: function () { return memLog.slice(); } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  /* ================================================================ browser wiring (HOME only) */
  if (!root || !root.document || !root.localStorage) return;
  if (root.__v292DfixSTORE1b) return;
  var killed = false; try { killed = root.localStorage.getItem(KILL) === '1'; } catch (e) { killed = true; }
  if (killed) return;                                                       /* kill: このキー 1 本を読んだだけ。入口も global も作らない */
  var st = { version: VERSION, opened: 0, surveys: 0, freed: 0, last: null, lastSurvey: null, dry: null };
  function lsg(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } }
  function benv() {
    var K = null; try { K = root.__v292DfixKEY1; K = (K && typeof K.enabled === 'function' && K.enabled()) ? K : null; } catch (e) { K = null; }
    return { ls: root.localStorage, ss: root.sessionStorage, now: function () { return Date.now(); }, key1: K, multi: lsg(MULTI) === '1',
             vault: root.__v292Dfix889 || null, inv: root.__v292Dfix562 || null, gate: root.__v292Dfix569 || null,
             iso2Foreign: function (id) { try { var I = root.__v292Diso2; if (!I || typeof I.stampOf !== 'function' || typeof I.owner !== 'function') return false;
               var me = I.owner().now, sp = I.stampOf(id, 's'); if (!sp) return false; return !!((sp.c && sp.c !== me) || (sp.w && sp.w !== me)); } catch (e) { return true; } } };
  }
  function bctx() {
    var L = null; try { L = root.navigator && root.navigator.locks; } catch (e) { L = null; }
    var lc = lockCtx(L);
    return {
      who: function () {
        return root.fetch('/api/auth/me', { method: 'GET', credentials: 'same-origin', cache: 'no-store', headers: { 'x-chronicle-csrf': '1' } })
          .then(function (r) { return r.ok ? r.json() : null; }, function () { return null; })
          .then(function (j) { return (j && j.ok === true && j.accountId) ? String(j.accountId) : null; }, function () { return null; });
      },
      getStory: function (id) { return new Promise(function (res) { var W = root.__v292Dfix697; if (!W || typeof W.getStoryV2Once !== 'function') return res(null);
        try { W.getStoryV2Once(id, function (x, err) { res(err ? null : x); }); } catch (e) { res(null); } }); },
      lockHeld: lc.lockHeld, withOpenLock: lc.withOpenLock, withMatLock: lc.withMatLock
    };
  }
  function ready() {
    if (lsg(KILL) === '1') return false;
    var e = benv(); if (!e.key1 || !e.inv || typeof e.inv.store1Arm !== 'function' || !e.gate || typeof e.gate.tryDeleteExact !== 'function') return false;
    var W = root.__v292Dfix697; if (!W || typeof W.getStoryV2Once !== 'function') return false;
    var A = root.__v292Dfix893; if (!(A && A.active)) return false;          /* アカウント方式（cookie session）の画面だけ */
    try { if (!(root.navigator && root.navigator.locks && typeof root.navigator.locks.query === 'function')) return false; } catch (e2) { return false; }
    return true;
  }

  /* ---- 画面内シート（window.confirm / prompt は使わない） ---- */
  var SHEET = 's1bsheet', STY = 's1bstyle', M = null;
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function kchars(n) { n = +n || 0; return n >= 10000 ? (Math.round(n / 1000) / 10 + ' 万字') : (n + ' 字'); }
  function ensureStyle() {
    if (root.document.getElementById(STY)) return;
    var s = root.document.createElement('style'); s.id = STY;
    s.textContent =
      '#' + SHEET + '{position:fixed;inset:0;z-index:100002;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.72);padding:16px;box-sizing:border-box}' +
      '#' + SHEET + ' .c{background:#1b1b20;color:#f2f2f4;border:1px solid #3a3a44;border-radius:12px;width:100%;max-width:520px;padding:18px;box-sizing:border-box;font-size:14px;line-height:1.7;max-height:calc(100vh - 32px);overflow:auto}' +
      '#' + SHEET + ' h2{margin:0 0 8px;font-size:17px}#' + SHEET + ' p{margin:0 0 8px;font-size:13px;color:#c8c8d0}' +
      '#' + SHEET + ' .soft{color:#ffcf7a;background:#2a2318;border:1px solid #574524;border-radius:8px;padding:8px 10px;font-size:12.5px;margin:0 0 10px}' +
      '#' + SHEET + ' .msg{font-size:13px;margin:8px 0;min-height:1.2em}' +
      '#' + SHEET + ' .row{border:1px solid #33333c;border-radius:8px;padding:8px 10px;margin:6px 0;display:flex;gap:10px;align-items:flex-start}' +
      '#' + SHEET + ' .row .t{font-weight:600}#' + SHEET + ' .row .s{font-size:12px;color:#a8a8b4}' +
      '#' + SHEET + ' .btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}' +
      '#' + SHEET + ' button{font:inherit;border-radius:8px;border:1px solid #4a4a56;background:#2a2a32;color:#f2f2f4;padding:8px 12px;cursor:pointer;min-height:44px}' +
      '#' + SHEET + ' button.go{background:#7a2d2d;border-color:#a04040}#' + SHEET + ' button:disabled{opacity:.45;cursor:default}' +
      '#s1bBtn{margin-left:10px;font-size:12px;padding:3px 9px;border-radius:6px;border:1px solid #555;background:transparent;color:inherit;cursor:pointer;vertical-align:middle}' +
      '@media(max-width:980px){#s1bBtn{min-height:44px;padding:8px 14px;font-size:14px;border-radius:8px}}';
    (root.document.head || root.document.documentElement).appendChild(s);
  }
  function closeSheet() { var e = root.document.getElementById(SHEET); if (e && e.parentNode) e.parentNode.removeChild(e); M = null; }
  function render() {
    if (!M) return;
    ensureStyle();
    var box = root.document.getElementById(SHEET);
    if (!box) { box = root.document.createElement('div'); box.id = SHEET; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); root.document.body.appendChild(box); box.addEventListener('click', onClick); box.addEventListener('change', onChange); }
    var h = '<div class="c"><h2>この端末の空き容量を増やす</h2>' +
            '<div class="soft" id="s1bnotice" role="note">' + esc(NOTICE) + '</div>' +
            '<p>一覧から削除した物語のうち、クラウドに同じ本文が残っていると確かめられたものだけを表示します。消すのはこの端末の写しだけで、クラウドのデータは変わりません。' +
            (M.multi ? '一度に ' + MAX_MULTI + ' 件まで選べます。1 件ずつ確かめながら消し、うまくいかない物語があればそこで止めます。' : '1 件ずつ選んで消します。') + '</p>';
    h += '<div class="msg" id="s1bmsg">' + esc(M.msg || '') + '</div>';
    if (M.rep && M.phase !== 'loading') {
      var t = M.rep.totals;
      h += '<p id="s1btotal">消せる物語 ' + t.stories + ' 件・合計 ' + esc(kchars(t.chars)) + '（スナップショット ' + t.snapshotsKept + ' 件は残します）</p>';
      var full = M.picks.length >= (M.multi ? MAX_MULTI : 1);
      for (var i = 0; i < M.rep.eligible.length; i++) {
        var r = M.rep.eligible[i], on = M.picks.indexOf(r.id) >= 0;
        var dis = M.phase !== 'ready' || (M.multi && full && !on);
        h += '<div class="row" data-row="' + esc(r.id) + '"><input type="checkbox" data-s1bchk="' + esc(r.id) + '"' + (on ? ' checked' : '') + (dis ? ' disabled' : '') + ' aria-label="選ぶ">' +
             '<div style="flex:1;min-width:0"><div class="t">' + esc(r.title || '（題名なし）') + '</div><div class="s">ターン ' + esc(r.turns == null ? '—' : r.turns) + '・この端末で空く量 ' + esc(kchars(r.chars)) + '</div></div></div>';
      }
      var sk = 0; for (var c in M.rep.skipped) sk += M.rep.skipped[c];
      if (sk) h += '<p>確かめられなかったため、今回は対象にしていない物語が ' + sk + ' 件あります（そのまま残します）。</p>';
      if (M.multi && M.phase === 'ready') h += '<p id="s1bsel">選んだ物語 ' + M.picks.length + ' 件・この端末で空く量 約 ' + esc(kchars(pickedChars())) + '（最大 ' + MAX_MULTI + ' 件）</p>';
    }
    if (M.phase === 'confirm' && M.picks.length) {
      var prs = pickedRows();
      if (prs.length === 1) h += '<div class="soft" id="s1bconfirm" role="note"><b>この端末から消す物語：</b>「' + esc(prs[0].title || '（題名なし）') + '」（' + esc(kchars(prs[0].chars)) + '）<br>' + esc(NOTICE) + '。</div>';
      else h += '<div class="soft" id="s1bconfirm" role="note"><b>この端末から消す物語：</b>' + prs.length + ' 件（合計 約 ' + esc(kchars(pickedChars())) + '）<br>' +
                prs.map(function (x) { return '「' + esc(x.title || '（題名なし）') + '」'; }).join('、') + '<br>' + esc(NOTICE) + '。<br>1 件ずつ確かめながら消します。うまくいかない物語があれば、そこで止めます（残りには手を付けません）。</div>';
    }
    if (M.result) h += '<p id="s1bresult">消した物語 ' + M.result.done + ' 件・止まった物語 ' + M.result.failed + ' 件' + (M.result.failedCode ? '（理由: ' + esc(M.result.failedCode) + '）' : '') + '・手を付けていない物語 ' + M.result.notProcessed + ' 件</p>';
    h += '<div class="btns">';
    if (M.phase === 'ready') h += '<button class="go" data-s1b="next"' + (M.picks.length ? '' : ' disabled') + '>' + (M.multi ? '選んだ ' + M.picks.length + ' 件をこの端末から消す' : '選んだ 1 件をこの端末から消す') + '</button><button data-s1b="close">閉じる</button>';
    else if (M.phase === 'confirm') h += '<button class="go" data-s1b="go">消す</button><button data-s1b="back">やめる</button>';
    else if (M.phase === 'loading' || M.phase === 'running') h += '<button disabled>' + (M.phase === 'running' ? ('消しています…' + (M.step ? '（' + M.step[0] + ' / ' + M.step[1] + '）' : '')) : '確認しています…') + '</button>';
    else h += '<button data-s1b="close">閉じる</button>';
    h += '</div></div>';
    box.innerHTML = h;
  }
  function pickedRows() { var o = []; if (!M || !M.rep) return o; for (var i = 0; i < M.rep.eligible.length; i++) if (M.picks.indexOf(M.rep.eligible[i].id) >= 0) o.push(M.rep.eligible[i]); return o; }
  function pickedChars() { var n = 0; pickedRows().forEach(function (x) { n += x.chars; }); return n; }
  function onChange(e) {
    var t = e.target; if (!M || !t || !t.getAttribute || M.phase !== 'ready') return;
    var id = t.getAttribute('data-s1bchk'); if (id == null) return;
    if (!M.multi) M.picks = t.checked ? [id] : M.picks.filter(function (x) { return x !== id; });   /* 1 件だけ（別のを選ぶと前の選択は外れる） */
    else if (t.checked) { if (M.picks.indexOf(id) < 0 && M.picks.length < MAX_MULTI) M.picks.push(id); }
    else M.picks = M.picks.filter(function (x) { return x !== id; });
    render();
  }
  function onClick(e) {
    var t = e.target; if (!t || !t.getAttribute || !M) return;
    var a = t.getAttribute('data-s1b');
    if (a === 'close') { closeSheet(); return; }
    if (a === 'next' && M.picks.length && M.phase === 'ready') { M.phase = 'confirm'; M.result = null; render(); return; }
    if (a === 'back' && M.phase === 'confirm') { M.phase = 'ready'; render(); return; }
    if (a === 'go' && M.phase === 'confirm') { if (M.multi && M.picks.length > 1) doFreeMany(pickedRows().map(function (x) { return x.id; })); else doFree(M.picks[0]); return; }
  }
  var MSG = { freed: 'この端末から消しました。', 'principal-changed': 'ログインの状態が途中で変わったため、何も消していません。', 'value-changed': 'この物語のデータが確認のあとで変わったため、何も消していません。',
              'keys-changed': 'この物語のデータが確認のあとで変わったため、何も消していません。', 'open-in-tab': 'この物語が別の画面で開かれているため、何も消していません。',
              'locks-unavailable': 'このブラウザでは安全に確かめられないため、何も消していません。', 'lock-busy': 'ほかの処理が動いているため、何も消していません。少し待ってからもう一度試してください。',
              'server-body-not-held': 'クラウドに本文が残っていると確かめられないため、何も消していません。', 'server-body-behind': 'この端末の方が新しい内容を持っているため、何も消していません。',
              'content-mismatch': 'この端末とクラウドで本文の内容が違うため、何も消していません。' };
  function doFree(id) {
    var mine = M; M.phase = 'running'; M.msg = ''; render();
    var e = benv();
    return freeOne(id, e, bctx()).then(function (x) {
      st.last = { code: x.code, removed: x.removed, chars: x.chars };
      var logRun = { at: Date.now(), v: VERSION, kind: 'free', code: x.code, removed: x.removed, chars: x.chars, turnsMatched: x.ok ? x.turnsMatched : undefined };
      if (x.ok) { st.freed++; logRun.id = id; logRun.snapshotsKept = x.snapshotsKept; logRun.backupKept = x.backupKept; logRun.unknownKept = x.unknownKept; }
      if (x.policyWhy) logRun.policyWhy = String(x.policyWhy); if (x.gateCode) logRun.gateCode = String(x.gateCode);
      writeLog(e, logRun);
      if (M !== mine) return x;
      var text = (MSG[x.code] || '確かめられなかったため、何も消していません。') + (x.ok ? '（' + kchars(x.chars) + '）' : '') + (!x.ok && x.removed ? '（途中まで ' + x.removed + ' 件消しました。一覧には戻りません。もう一度開くと残りを確かめます）' : '');
      return openFlow(text);
    });
  }
  function doFreeMany(ids) {
    var mine = M; M.phase = 'running'; M.msg = ''; M.step = [0, ids.length]; render();
    var e = benv();
    return freeMany(ids, e, bctx(), function (i, n) { if (M === mine) { M.step = [i, n]; render(); } }).then(function (x) {
      st.last = { code: x.code, done: x.done, failed: x.failed, notProcessed: x.notProcessed, failedCode: x.failedCode, removed: x.removed, chars: x.chars };
      st.freed += x.done;
      var logRun = { at: Date.now(), v: VERSION, kind: 'free-multi', code: x.code, total: x.total, done: x.done, failed: x.failed, notProcessed: x.notProcessed,
                     failedCode: x.failedCode, removed: x.removed, chars: x.chars, ids: x.doneIds.slice() };   /* 消した物語の id だけ（Vault は関門で対象外） */
      writeLog(e, logRun);
      if (M !== mine) return x;
      var text = x.code === 'all-freed' ? ('選んだ ' + x.done + ' 件をこの端末から消しました。（' + kchars(x.chars) + '）')
               : ('途中で止めました。' + (MSG[x.failedCode] || '確かめられなかった物語があったため、そこから先は何も消していません。') + (x.partial ? '（止まった物語は ' + x.partial + ' 件のキーまで消しました。一覧には戻りません。もう一度開くと残りを確かめます）' : ''));
      var res = { done: x.done, failed: x.failed, notProcessed: x.notProcessed, failedCode: x.failedCode };
      return openFlow(text, res);
    });
  }
  function openFlow(msg, result) {
    st.opened++;
    M = { phase: 'loading', msg: msg || '確認しています…', rep: null, picks: [], multi: lsg(MULTI) === '1', result: result || null, step: null };
    render();
    if (!ready()) { M.phase = 'done'; M.msg = 'いまはこの操作を使えません。物語はそのまま残っています。'; render(); return Promise.resolve(false); }
    var mine = M;
    return survey(benv(), bctx()).then(function (rep) {
      st.surveys++; st.lastSurvey = logOfSurvey(rep, 'survey');
      if (M !== mine) return false;
      M.rep = rep; M.phase = rep.eligible.length ? 'ready' : 'done';
      M.msg = (msg && msg !== '確認しています…') ? msg : (rep.eligible.length ? '' : 'いまこの端末から消せる物語はありません。');
      render(); return true;
    });
  }
  /* ---- 入口（HOME の「すべての物語」見出しの横・DL2 のボタンの後ろ） ---- */
  function decorate() {
    var on = ready(), b = root.document.getElementById('s1bBtn'), lt = root.document.getElementById('listTitle');
    if (on && !b && lt && lt.parentNode) {
      ensureStyle();
      b = root.document.createElement('button'); b.id = 's1bBtn'; b.type = 'button'; b.textContent = 'この端末の空き容量を増やす';
      b.addEventListener('click', function (ev) { ev.stopPropagation(); openFlow(); });
      var after = root.document.getElementById('dl2BulkBtn') || lt;
      after.parentNode.insertBefore(b, after.nextSibling);
    } else if (!on && b && b.parentNode) b.parentNode.removeChild(b);
  }
  /* ---- dry-run（v292DfixSTORE1Dry='1' のときだけ。HOME を開いたあと 1 回・消さない・記録だけ） ---- */
  function dryRun() {
    var e = benv();
    if (!ready()) { var r0 = { at: Date.now(), v: VERSION, kind: 'dry', notReady: true }; writeLog(e, r0); st.dry = r0; return Promise.resolve(r0); }
    return survey(e, bctx()).then(function (rep) { var L = logOfSurvey(rep, 'dry'); L.logWritten = writeLog(e, L); st.dry = L; return L; });
  }
  root.__v292DfixSTORE1b = {
    version: VERSION,
    open: function () { return openFlow(); },
    multi: function () { return lsg(MULTI) === '1'; },
    dryRun: dryRun,
    status: function () { return JSON.parse(JSON.stringify({ version: VERSION, ready: ready(), opened: st.opened, surveys: st.surveys, freed: st.freed, last: st.last, lastSurvey: st.lastSurvey, dry: st.dry, memLog: memLog })); }
  };
  function boot() {
    decorate();
    try { var mo = new root.MutationObserver(function () { if (!root.document.getElementById('s1bBtn')) decorate(); }); mo.observe(root.document.body, { childList: true, subtree: true }); } catch (e) {}
    if (lsg(DRY) === '1') root.setTimeout(function () { dryRun(); }, 6000);
  }
  if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', function () { root.setTimeout(boot, 1500); }); else root.setTimeout(boot, 1500);
})(typeof window !== 'undefined' ? window : null);
