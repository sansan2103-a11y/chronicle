/* =====================================================================
 * v292DfixLC1-workbench.js — 「👥 キャラ」の最上段の作業欄（Lane C・GPT #127-IJ）
 * ---------------------------------------------------------------------
 * flag: localStorage v292DfixLC1On='1' で ON（既定 OFF）／ v292DfixLC1Off='1' で全停止（ON でも無効）。OFF のときは何もしない
 *   （画面も通信もタイマーも無い。フックの口だけが「何もしない」を返す）。
 * 何をするか
 *   1. 通常画面の操作は 1 キャラにつき 2 つだけ: 絵が無い →「絵を作る」／絵がある →「絵を変える」。
 *      ・確定済みの外見があるキャラは文章を聞き直さない。ボタン 1 回が明示的な開始（絵なし: ensureFirst／絵あり: 新しい候補を 1 枚）。
 *        確定済みの外見は黙って変えない。候補は作るだけで、採用は本人の「この絵にする」のときだけ（adoptCandidate はこのファイルから呼ばない）。
 *      ・確定済みの外見が無いキャラは、ボタンを押したときに外見の案を作る（開いただけでは AI を呼ばない）。案は編集できる欄に出し、
 *        「この外見で作る」を押すと setProfile →（物語・キャラ・アカウントの確かめ直し）→ ensureFirst / 新しい候補 を 1 回。
 *        setProfile が失敗したら画像の呼び出しは 0。
 *   2. 「まとめて絵を作る」: 絵が採用されていない全員を最初から選んだ状態で開く（手動で開いたときだけ）。外せる。
 *      「N 人の絵をまとめて作る」を 1 回押すと 1 人ずつ（1 分 4 枚の待ち・402/429/利用記録の不調で停止・422 はそのキャラだけ失敗）。
 *      外見が未確定のキャラは、先に案を作って見せる（編集できる）→「この外見で N 人の絵を作る」。一括は ensureFirst だけ（採用済みの絵は動かない）。
 *      失敗した行だけ「もう一度」。BUDGET / OUTCOME_UNKNOWN には出さない（OUTCOME_UNKNOWN は「結果を確かめる」）。
 *   3. B37 の案内パネルを吸収する（LC1 が ON の間、B37 の自動パネルと「🎨 登場人物の絵をまとめて作る」ボタンは出ない）。
 *      一覧が他のモジュールに作り直されても、状態はこのファイルが持っていて付け直す。
 *   4. portrait.js の afterSidePort の再読み込みを、作業欄が開いている間は保留し、閉じたあとに 1 回だけ行う（holdReload）。
 *   5. 詳細: 既存の「外見を設定」は「詳細 ▾」の中の「外見を編集」として残る（中身は変えない）。
 *   6. 生成の状態は genState(characterId) → {phase:'idle'|'checking'|'generating'|'done'|'failed', code, at} を通して読む
 *      （Lane B の状態契約が出たら useGenState(fn) で差し替える）。Lane E の比較画面があれば openCompare を呼び、無ければ既存のピッカー。
 * 通常画面に金額（$）は出さない。上限は平易な日本語で出す。
 * 観測口: window.__v292DfixLC1.status()
 * ===================================================================== */
(function () {
  'use strict';
  if (typeof window === 'undefined' || window.__v292DfixLC1) return;
  var TAG = '[LC1]';
  function lsg(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  var ON = lsg('v292DfixLC1On') === '1' && lsg('v292DfixLC1Off') !== '1';
  if (!ON) {   /* OFF: 画面も通信もタイマーも無い。フックの口だけ */
    window.__v292DfixLC1 = { version: 'LC1-r1', on: function () { return false; }, holdReload: function () { return false; }, openFromB37: function () { return { ok: false, code: 'OFF' }; },
      status: function () { return { on: false }; } };
    return;
  }

  var COST_N = 4, RATE_MS = 60000;
  function A() { return window.__chronicleAssetV2 || null; }
  function F697() { return window.__v292Dfix697 || null; }
  function PR() { return window.__v292DfixLC1prop || null; }
  function state() { try { return (typeof window.__chronicleGetState === 'function') ? window.__chronicleGetState('lc1') : null; } catch (e) { return null; } }
  function sid() { try { var f = F697(); var s = f && f.status ? f.status().storyId : null; return s ? String(s) : null; } catch (e) { return null; } }
  function doc() { try { var m = window.__v292Dav2Map; return (m && typeof m.docSchema2 === 'function') ? m.docSchema2() : null; } catch (e) { return null; } }
  function acct() { try { var F = window.__v292Dfix893; var me = (F && typeof F.me === 'function') ? F.me() : null; return (me && me.accountId) ? String(me.accountId) : null; } catch (e) { return null; } }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function genderOf(v) { return (v === '女性' || v === '男性') ? v : ''; }
  var LOG = []; function note(o) { try { o.t = Date.now(); LOG.push(o); if (LOG.length > 150) LOG.shift(); } catch (e) {} }
  var stats = { ai: 0, set: 0, ef: 0, nd: 0, adopt: 0, reloads: 0, held: 0, attaches: 0 };

  /* ---------- 読み取り（B37 と同じ部品）---------- */
  function chars() {
    var S = state(); if (!S || !S.cast) return [];
    var out = [], c = S.cast;
    var add = function (e, hero) {
      if (!e || typeof e !== 'object' || typeof e.character_id !== 'string') return;
      if (e.status === 'DELETED' || e.status === 'DEPARTED') return;
      var nm = String(e.name || '').normalize('NFC').trim(); if (!nm) return;
      out.push({ id: e.character_id, name: nm, hero: !!hero });
    };
    add(c.hero, true);
    (Array.isArray(c.npcs) ? c.npcs : []).forEach(function (n) { add(n, false); });
    return out;
  }
  function suggest(cid) { try { var a = A(); var s = a && a.suggestAppearance ? a.suggestAppearance(cid) : null; return (s && s.ok) ? s : null; } catch (e) { return null; } }
  function preview(g, app) { var a = A(); try { if (a && typeof a.previewProfile === 'function') return a.previewProfile({ gender: g, appearance: app }); } catch (e) {} return { appearance: String(app || '').replace(/\s+/g, ' ').trim(), gender: genderOf(g) }; }
  function lore() { try { var S = state(); return S && S.scene && typeof S.scene.lore === 'string' ? S.scene.lore : ''; } catch (e) { return ''; } }
  function pointers(id, cb) {
    var f = F697(); if (!f || typeof f.assetV2Read !== 'function') return cb(null);
    f.assetV2Read('portrait.list', { story_id: id }, function (r, err) {
      var j = r && r.j; if (err || !r || r.status !== 200 || !j || !Array.isArray(j.portraits)) return cb(null);
      var by = {}; j.portraits.forEach(function (p) { if (p && typeof p.character_id === 'string') by[p.character_id] = p.asset_id || 1; }); cb(by);
    });
  }
  function av2Idle() {
    var a = A(); if (!a || typeof a.status !== 'function') return false;
    try { var s = a.status(); if (!s || !s.schema2 || (s.reg && s.reg.busy)) return false;
      if (a.pending && a.pending()) return false; if (a.blocked && a.blocked()) return false; if (a.conflict && a.conflict()) return false; return true; } catch (e) { return false; }
  }
  function saveClean(id) { try { var F = window.__v292Dfix781; var m = (F && typeof F.marker === 'function') ? F.marker(id) : null; return !!(m && m.state === 'CLEAN' && !m.inFlightSave); } catch (e) { return false; } }
  function waitClean(id, ms, cb) { var t0 = Date.now(); (function poll() { if (saveClean(id) && av2Idle()) return cb(true); if (Date.now() - t0 > ms) return cb(false); setTimeout(poll, 500); })(); }
  function waitIdle(ms, cb) { var t0 = Date.now(); (function poll() { if (av2Idle()) return cb(true); if (Date.now() - t0 > ms) return cb(false); setTimeout(poll, 400); })(); }
  function busyDoc() { try { var S = state(); if (S && S.inFlight) return true; var inp = document.getElementById('inp'); return !!(inp && String(inp.value || '').trim()); } catch (e) { return true; } }
  function same(id, a0) { return sid() === id && acct() === a0 && doc() === true; }
  function modal() { return document.querySelector('.v292Dfix145-modal'); }

  /* ---------- 画面の状態（一覧が作り直されてもここに残る）---------- */
  var W = { id: null, acct: null, rows: {}, ptr: null, ptrAt: 0, ptrLoading: false, bulk: false, bulkPhase: null, busyOp: null, stop: false, msg: '', tone: '',
            needReload: false, reloaded: false, detailOpen: {}, want: null, callTimes: [], lastSummary: null, sig: '' };
  function resetFor(id) { W.id = id; W.acct = acct(); W.rows = {}; W.ptr = null; W.ptrAt = 0; W.bulk = false; W.bulkPhase = null; W.msg = ''; W.tone = ''; W.stop = false; W.want = null; }
  function rowOf(c) {
    var r = W.rows[c.id];
    if (!r) r = W.rows[c.id] = { cid: c.id, name: c.name, hero: c.hero, phase: 'idle', prop: null, msg: '', tone: '', code: null, fail: null, chk: false, cand: false, kind: null, at: 0, pg: null, pa: null, ok: null };
    r.name = c.name; r.hero = c.hero; return r;
  }
  function syncRows() {
    var cs = chars(), keep = {};
    cs.forEach(function (c) { rowOf(c); keep[c.id] = 1; });
    Object.keys(W.rows).forEach(function (k) { if (!keep[k]) delete W.rows[k]; });
    return cs;
  }
  function derive(cid) {
    var s = suggest(cid) || {}, cur = s.current || {};
    var has = W.ptr ? !!W.ptr[cid] : null;
    return { has: has, conf: !!cur.appearance, confApp: cur.appearance || '', confG: cur.gender || '', castG: genderOf(s.gender), desc: s.desc || '', known: W.ptr !== null };
  }
  function loadPtr(force, cb) {
    var id = sid(); if (!id) return cb && cb(false);
    if (!force && W.ptr && Date.now() - W.ptrAt < 45000) return cb && cb(true);
    if (W.ptrLoading) { setTimeout(function () { loadPtr(false, cb); }, 300); return; }
    W.ptrLoading = true;
    pointers(id, function (by) { W.ptrLoading = false; if (sid() !== id) return cb && cb(false); if (by) { W.ptr = by; W.ptrAt = Date.now(); } cb && cb(!!by); renderSoon(); });
  }

  /* ---------- 生成の状態のアダプタ（Lane B の契約が出たら useGenState で差し替える）---------- */
  var gsProvider = null;
  function genStateInternal(cid) {
    var r = W.rows[cid]; if (!r) return { phase: 'idle', code: null, at: 0 };
    var ph = r.phase, p = 'idle';
    if (ph === 'proposing' || ph === 'saving' || ph === 'checking') p = 'checking';
    else if (ph === 'generating') p = 'generating';
    else if (ph === 'done') p = 'done';
    else if (ph === 'failed') p = 'failed';
    return { phase: p, code: r.code || null, at: r.at || 0 };
  }
  function genState(cid) {
    if (gsProvider) { try { var v = gsProvider(cid); if (v && typeof v.phase === 'string') return v; } catch (e) {} }
    return genStateInternal(cid);
  }

  /* ---------- 文言（金額は出さない）---------- */
  var EF_MSG = { CREATED: '絵を作りました', CREATED_CONFIRMED: '絵を作りました', EXISTS: 'もう絵がありました（作っていません）',
    BUDGET: '今月の画像生成の上限に達しています。これ以上は作れません', RATE_LIMITED: '画像生成が混み合っています。少し時間をおいて、この行の「もう一度」を押してください',
    LEDGER_UNHEALTHY: '利用記録の確認中のため、画像の作成を止めています。少しあとでお試しください',
    PROFILE_NOT_ENGLISH: '外見の文の中に、絵の指示に直せない言葉がありました（絵は作っていません）。髪・目・服などの見た目だけを短く書き直してください',
    GENERATION_FAILED: '絵を作れませんでした', OUTCOME_UNKNOWN: '結果を確認できませんでした。「結果を確かめる」を押してください（送り直しはしません）',
    UNGROUNDED_REQUIRES_EXPLICIT_NEW_DRAW: '外見の情報が届いていなかったので作っていません', PROFILE_REVIEW_REQUIRED: '外見の確認が必要です',
    CANDIDATES_PENDING: '候補の絵があります。「候補から選ぶ」で選んでください', IN_FLIGHT: '作成中です。少し待ってから確かめてください', IN_PROGRESS: '作成中です',
    LOST_RACE: '別の操作で絵が決まりました', READ_FAIL: 'サーバーに接続できませんでした', REGISTRATION_IN_PROGRESS: '保存の確認中です。少し待ってからお試しください',
    REBASE_REQUIRED: 'サーバー側の物語が更新されています。ページを再読み込みしてください', REGISTRATION_BLOCKED: '登録内容が拒否されています。先に名前などを直してください',
    NOT_FOUND: 'この物語では使えません', ASSET_V2_UNAVAILABLE: 'この物語では使えません', NOT_SCHEMA2_DOCUMENT: 'この物語では使えません',
    RECHECK_FAIL: '物語・キャラクター・アカウントを確かめられなかったので、絵は作っていません', PROFILE_MISMATCH: '確定した外見をこの端末で確かめられなかったので、絵は作っていません。ページを再読み込みしてください',
    NO_PROFILE: '確定した外見が無いので、絵は作っていません' };
  var SET_MSG = { LOCAL_NOT_SYNCED: 'この端末の保存がまだサーバーと揃っていません', REBASE_REQUIRED: 'サーバー側の物語が更新されています', READ_FAIL: 'サーバーに接続できませんでした',
    NOT_CANONICAL_ROW: 'この物語はサーバー側で編集できない状態です', CONFLICT: 'サーバー側が更新されていました', NOT_APPLIED: '反映を確認できませんでした', EMPTY_APPEARANCE: '外見の文が空です',
    REGISTRATION_IN_PROGRESS: '保存の確認中でした', UNKNOWN_CHARACTER_ID: 'このキャラクターは登録されていません', CHARACTER_DELETED: '削除済みのキャラクターです',
    APPLIED_SERVER_MOVED: '保存されましたが、別の端末も更新しています', AV2_OFF: 'この端末ではこの操作はできません', AV2_FLAG_OFF: 'この端末ではこの操作はできません', OWNER_CONFIRM_REQUIRED: '確認が必要です' };
  var STOP_SET = { LOCAL_NOT_SYNCED: 1, REBASE_REQUIRED: 1, READ_FAIL: 1, NOT_CANONICAL_ROW: 1, CONFLICT: 1, NOT_APPLIED: 1, READBACK_FAIL: 1, APPLIED_SERVER_MOVED: 1,
    SERVER_NOT_SCHEMA2: 1, AV2_OFF: 1, AV2_FLAG_OFF: 1, NOT_SCHEMA2_DOCUMENT: 1, 'canonical-deleted': 1, 'not-canonical': 1 };
  var NO_RETRY = { BUDGET: 1, OUTCOME_UNKNOWN: 1, PROFILE_NOT_ENGLISH: 1, REBASE_REQUIRED: 1, REGISTRATION_BLOCKED: 1, NOT_FOUND: 1, ASSET_V2_UNAVAILABLE: 1, NOT_SCHEMA2_DOCUMENT: 1 };
  function efText(code) { return EF_MSG[code] || 'できませんでした'; }

  /* ---------- 1 分 4 枚の待ち（B37 の run() と同じ）---------- */
  function paced(setMsg, cb) {
    var now = Date.now(); W.callTimes = W.callTimes.filter(function (t) { return now - t < RATE_MS; });
    if (W.callTimes.length < COST_N) return cb();
    var end = now + (RATE_MS - (now - W.callTimes[0])) + 1000;
    (function tick() { var left = Math.ceil((end - Date.now()) / 1000);
      if (left <= 0) { setMsg(''); return paced(setMsg, cb); }
      setMsg('1 分に作れる枚数（' + COST_N + ' 枚）の上限を超えないように待っています…（あと ' + left + ' 秒）'); setTimeout(tick, 1000); })();
  }

  /* ---------- 比較画面（Lane E）/ 既存のピッカー ---------- */
  function openCandidates(cid, newCand) {
    var r = W.rows[cid]; var A0 = A();
    var LE = window.__v292DfixLE1;
    var fallback = function () {
      var card = document.querySelector('.v292Dfix145-card[data-av2-cid="' + cid + '"]');
      var pk = card && card.querySelector('[data-av2-pick]');
      if (pk) { try { pk.click(); } catch (e) {} note({ kind: 'PICKER_FALLBACK', cid: cid }); return true; }
      if (r) { r.msg = '👥 キャラ の「詳細」にある「候補から選ぶ」で選んでください'; r.tone = 'info'; renderSoon(); }
      return false;
    };
    if (LE && typeof LE.openCompare === 'function' && A0 && typeof A0.listCandidates === 'function') {
      A0.listCandidates(cid, function (res) {
        var cur = res && res.ok && res.current ? res.current.asset_id : null;
        var ids = res && res.ok ? res.items.map(function (x) { return x.asset_id; }) : (newCand ? [newCand] : []);
        try { LE.openCompare({ characterId: cid, name: r ? r.name : '', currentAssetId: cur, candidateAssetIds: ids, newCandidateId: newCand || null }); note({ kind: 'COMPARE_OPEN', cid: cid, n: ids.length }); }
        catch (e) { fallback(); }
      });
      return true;
    }
    return fallback();
  }

  /* ---------- 生成の共通部分（確かめ直し → 待ち → 1 回だけ送る）---------- */
  function checkGround(cid, g, expect) {
    var cs = chars().filter(function (c) { return c.id === cid; });
    if (!same(g.id, g.acct) || !cs.length) return 'RECHECK_FAIL';
    var cur = (suggest(cid) || {}).current || {};
    if (!cur.appearance) return 'NO_PROFILE';                                    /* 確定した外見が無いまま画像を呼ばない */
    if (expect && !(String(cur.appearance) === expect.appearance && String(cur.gender || '') === expect.gender)) return 'PROFILE_MISMATCH';
    return null;
  }
  function generate(cid, kind, g, expect, setMsg, onPhase, cb) {
    var bad = checkGround(cid, g, expect);
    if (bad) return cb({ ok: false, code: bad, calls: 0 });
    paced(setMsg, function () {
      var bad2 = checkGround(cid, g, expect);
      if (bad2) return cb({ ok: false, code: bad2, calls: 0 });
      onPhase('generating');
      var A0 = A(); if (!A0) return cb({ ok: false, code: 'NOT_SCHEMA2_DOCUMENT', calls: 0 });
      if (kind === 'ef') { stats.ef++; A0.ensureFirst(cid, {}, function (x) { if (x && x.calls === 1) W.callTimes.push(Date.now()); note({ kind: 'EF', cid: cid, ok: !!(x && x.ok), code: x && x.code, calls: x && x.calls }); cb(x || { ok: false, code: 'UNKNOWN' }); }); }
      else { stats.nd++; A0.newDraw(cid, { ownerExplicit: true }, function (x) { if (x && x.calls === 1) W.callTimes.push(Date.now()); note({ kind: 'ND', cid: cid, ok: !!(x && x.ok), code: x && x.code, calls: x && x.calls, grounded: x && x.grounded }); cb(x || { ok: false, code: 'UNKNOWN' }); }); }
    });
  }
  function lock(who) { W.busyOp = who; }
  function unlock() { W.busyOp = null; renderSoon(); }
  function isBusy(r) { return r.phase === 'proposing' || r.phase === 'saving' || r.phase === 'checking' || r.phase === 'generating'; }
  function setRow(r, o) { for (var k in o) r[k] = o[k]; r.at = Date.now(); renderSoon(true); }

  /* 1 キャラの結果を行に反映（採用はしない）*/
  function applyResult(r, kind, x) {
    var code = (x && x.code) || 'UNKNOWN';
    r.code = code;
    if (x && x.ok) {
      if (kind === 'ef') { if (W.ptr) W.ptr[r.cid] = (W.ptr[r.cid] || 1); r.cand = false; try { window.__chronicleAv2Portrait && window.__chronicleAv2Portrait.refresh && window.__chronicleAv2Portrait.refresh(); } catch (e) {}
        setRow(r, { phase: 'done', ok: true, fail: null, msg: EF_MSG[code] || '絵を作りました', tone: 'ok', prop: null }); return 'ok'; }
      setRow(r, { phase: 'done', ok: true, fail: null, msg: '候補を1枚作りました（まだ採用していません。今の絵はそのままです）', tone: 'ok', prop: null, lastCand: x.candidate || null }); return 'ok';
    }
    if (code === 'CANDIDATES_PENDING') { setRow(r, { phase: 'idle', ok: null, cand: true, fail: null, msg: EF_MSG[code], tone: 'info', prop: null }); return 'cand'; }
    if (code === 'EXISTS') { if (W.ptr) W.ptr[r.cid] = 1; setRow(r, { phase: 'done', ok: true, fail: null, msg: EF_MSG.EXISTS, tone: 'ok' }); return 'ok'; }
    setRow(r, { phase: 'failed', ok: false, msg: efText(code), tone: 'ng', fail: { code: code, kind: kind, stage: 'gen', retry: !NO_RETRY[code], unknown: code === 'OUTCOME_UNKNOWN', fix: code === 'PROFILE_NOT_ENGLISH' } });
    return 'fail';
  }

  /* ---------- 個別: 「絵を作る」「絵を変える」---------- */
  function pressMain(cid) {
    var r = W.rows[cid]; if (!r || isBusy(r)) return;
    var d = derive(cid);
    if (!d.known) { r.msg = '絵の状態を確かめています。少し待ってください'; r.tone = 'info'; renderSoon(true); loadPtr(true); return; }
    if (r.cand && !d.has) { openCandidates(cid); return; }
    if (W.busyOp) { r.msg = 'ほかの作成が終わるまで、少し待ってください'; r.tone = 'info'; renderSoon(true); return; }
    if (!av2Idle()) { r.msg = '保存の確認中です。少し待ってからお試しください'; r.tone = 'info'; renderSoon(true); return; }
    if (d.conf) return startDirect(cid, d.has ? 'nd' : 'ef');
    startPropose(cid, null);
  }
  function startDirect(cid, kind) {
    var r = W.rows[cid]; if (!r) return;
    var g = { id: sid(), acct: acct() };
    lock('op:' + cid); setRow(r, { phase: 'checking', msg: '', tone: '', fail: null, kind: kind });
    generate(cid, kind, g, null, function (m) { r.msg = m; r.tone = 'info'; renderSoon(true); }, function (ph) { setRow(r, { phase: ph, msg: kind === 'ef' ? '絵を作っています…' : '候補を作っています…', tone: 'info' }); }, function (x) {
      var res = applyResult(r, kind, x); unlock();
      if (res === 'ok' && kind === 'nd') openCandidates(cid, x.candidate || null);
      if (res === 'cand') openCandidates(cid);
    });
  }
  function startPropose(cid, baseOverride) {
    var r = W.rows[cid]; if (!r) return;
    var d = derive(cid), P = PR();
    var prevPg = r.pg;
    setRow(r, { phase: 'proposing', msg: '外見の案を作っています…', tone: 'info', fail: null });
    var input = { name: r.name, gender: d.castG, desc: d.desc, confirmed: baseOverride != null ? String(baseOverride) : '', context: lore().slice(0, 120), hero: r.hero };
    var done = function (res) {
      if (!W.rows[cid] || r.phase !== 'proposing') return;
      res = res || {};
      var g = d.castG || genderOf(prevPg) || genderOf(res.gender);
      r.prop = { ok: !!res.ok, code: res.code || null, appearance: res.appearance || '', original: res.base || '', last: res.appearance || '', gender: g, genderFixed: !!d.castG, added: res.added || [], dropped: res.dropped || [], aiCalled: !!res.aiCalled };
      r.pg = g; r.pa = r.prop.appearance;
      setRow(r, { phase: 'proposed', msg: '', tone: '' });
    };
    if (P && typeof P.propose === 'function') { stats.ai++; P.propose(input, done); }
    else done({ ok: false, code: 'NO_MODULE', appearance: '', base: '', gender: d.castG });
  }
  function syncInputs() {
    var box = document.getElementById(WA); if (!box) return;
    Object.keys(W.rows).forEach(function (cid) {
      var r = W.rows[cid];
      var c = box.querySelector('[data-lc1-chk="' + cid + '"]'); if (c) r.chk = !!c.checked;
      var a = box.querySelector('[data-lc1-a="' + cid + '"]'); if (a) r.pa = a.value;
      var g = box.querySelector('[data-lc1-g="' + cid + '"]'); if (g) r.pg = g.value;
    });
  }
  function pressGo(cid) {
    var r = W.rows[cid]; if (!r || r.phase !== 'proposed') return;
    syncInputs();
    var pv = preview(r.pg || '', r.pa || '');
    if (!pv.appearance) { r.msg = '外見の文を入力してください（絵は作っていません）'; r.tone = 'ng'; renderSoon(true); return; }
    if (W.busyOp) { r.msg = 'ほかの作成が終わるまで、少し待ってください'; r.tone = 'info'; renderSoon(true); return; }
    if (!av2Idle()) { r.msg = '保存の確認中です。少し待ってからお試しください'; r.tone = 'info'; renderSoon(true); return; }
    var d = derive(cid), kind = d.has ? 'nd' : 'ef';
    commitThenDraw(cid, kind, pv, null);
  }
  /* setProfile（本人が「この外見で作る」を押した）→ 確かめ直し → 1 回だけ生成。setProfile が失敗したら画像は 0 */
  function commitThenDraw(cid, kind, pv, bulkCb) {
    var r = W.rows[cid]; var g = { id: sid(), acct: acct() };
    if (!bulkCb) lock('op:' + cid);
    setRow(r, { phase: 'saving', msg: '外見を保存しています…', tone: 'info', fail: null, kind: kind });
    stats.set++;
    A().setProfile(cid, { gender: pv.gender, appearance: pv.appearance, ownerConfirmed: true }, function (res) {
      note({ kind: 'SET', cid: cid, ok: !!(res && res.ok), code: res && res.code, mirror: res && res.mirror });
      if (!(res && res.ok)) {
        var code = (res && res.code) || 'UNKNOWN';
        setRow(r, { phase: bulkCb ? 'failed' : 'proposed', ok: false, code: code, msg: '外見を保存できませんでした（' + (SET_MSG[code] || 'できませんでした') + '）。絵は作っていません', tone: 'ng',
          fail: bulkCb ? { code: code, kind: kind, stage: 'set', retry: true } : null });
        if (code === 'APPLIED_SERVER_MOVED') W.needReload = true;
        if (!bulkCb) unlock(); else bulkCb({ stop: !!STOP_SET[code], code: code });
        return;
      }
      if (!res.noop) W.needReload = true;
      setTimeout(function () {
        generate(cid, kind, g, pv, function (m) { r.msg = m; r.tone = 'info'; renderSoon(true); }, function (ph) { setRow(r, { phase: ph, msg: kind === 'ef' ? '絵を作っています…' : '候補を作っています…', tone: 'info' }); }, function (x) {
          var out = applyResult(r, kind, x);
          if (bulkCb) return bulkCb({ result: out, code: x && x.code });
          unlock();
          if (out === 'ok' && kind === 'nd') openCandidates(cid, x.candidate || null);
          if (out === 'cand') openCandidates(cid);
        });
      }, 200);
    });
  }
  function pressRegen(cid) {
    var r = W.rows[cid]; if (!r || r.phase !== 'proposed') return; syncInputs();
    var cur = String(r.pa || '');
    /* 欄を触っていなければ最初の土台（本人の語）から作り直す。触っていたら、その文を土台にして足りない枠だけ足す */
    var base = (r.prop && cur === r.prop.last) ? (r.prop.original || '') : cur;
    startPropose(cid, base);
  }
  function pressCancel(cid) { var r = W.rows[cid]; if (!r) return; setRow(r, { phase: 'idle', prop: null, msg: '', tone: '', pa: null, pg: null }); }
  function pressRetry(cid) {
    var r = W.rows[cid]; if (!r || !r.fail || !r.fail.retry || isBusy(r)) return;
    if (W.busyOp) { r.msg = 'ほかの作成が終わるまで、少し待ってください'; r.tone = 'info'; renderSoon(true); return; }
    if (!av2Idle()) { r.msg = '保存の確認中です。少し待ってからお試しください'; r.tone = 'info'; renderSoon(true); return; }
    var f = r.fail, d = derive(r.cid);
    if (f.stage === 'set' || !d.conf) {            /* 外見がまだ確定していない → 案の欄に戻す（AI は呼び直さない）*/
      if (!r.prop) r.prop = { ok: true, code: null, appearance: r.pa || '', original: r.pa || '', last: r.pa || '', gender: r.pg || d.castG, genderFixed: !!d.castG, added: [], dropped: [], aiCalled: false };
      return setRow(r, { phase: 'proposed', msg: '', tone: '', fail: null });
    }
    startDirect(r.cid, d.has ? 'nd' : (f.kind || 'ef'));
  }
  function pressFix(cid) {            /* 422: 行の中で外見を直す（確定済みの文を欄に入れる。確定するのは本人が押したとき）*/
    var r = W.rows[cid]; if (!r) return; var d = derive(cid);
    r.prop = { ok: true, code: null, appearance: d.confApp, original: d.confApp, last: d.confApp, gender: d.confG || d.castG, genderFixed: false, added: [], dropped: [], aiCalled: false, editing: true };
    r.pa = d.confApp; r.pg = d.confG || d.castG; setRow(r, { phase: 'proposed', msg: '', tone: '', fail: null });
  }
  function pressCheck(cid) {          /* OUTCOME_UNKNOWN: 読むだけ（送り直さない）*/
    var r = W.rows[cid]; if (!r) return; var f = r.fail || {};
    if (f.kind === 'nd') { r.msg = '候補を確かめます'; r.tone = 'info'; renderSoon(true); return openCandidates(cid); }
    setRow(r, { msg: '確かめています…', tone: 'info' });
    loadPtr(true, function () { var d = derive(cid);
      if (d.has) { setRow(r, { phase: 'done', ok: true, fail: null, code: 'CREATED_CONFIRMED', msg: '絵ができていました', tone: 'ok' }); }
      else setRow(r, { msg: 'まだ絵は見つかりません。少し待ってから、もう一度「結果を確かめる」を押してください', tone: 'info' }); });
  }

  /* ---------- 一括 ---------- */
  function lacking() { return syncRows().filter(function (c) { var d = derive(c.id); return d.known && !d.has; }); }
  function openBulk(preselect) {
    W.bulk = true; W.bulkPhase = 'select'; W.msg = ''; W.tone = '';
    loadPtr(true, function () {
      syncRows(); Object.keys(W.rows).forEach(function (cid) { var d = derive(cid); W.rows[cid].chk = !!(preselect && d.known && !d.has && !isBusy(W.rows[cid])); });
      if (!lacking().length) { W.msg = '全員にもう絵があります。'; W.tone = 'info'; }
      renderSoon(true);
    });
    renderSoon(true);
  }
  function closeBulk() { if (W.busyOp === 'bulk') return; W.bulk = false; W.bulkPhase = null; W.msg = ''; W.tone = ''; Object.keys(W.rows).forEach(function (k) { var r = W.rows[k]; r.chk = false; if (r.phase === 'proposed' && r.prop) { r.phase = 'idle'; r.prop = null; } }); renderSoon(true); }
  function selected() { return Object.keys(W.rows).map(function (k) { return W.rows[k]; }).filter(function (r) { var d = derive(r.cid); return r.chk && d.known && !d.has; }); }
  function pressBulkGo() {
    syncInputs();
    var sel = selected();
    if (!sel.length) { W.msg = '作るキャラを選んでください'; W.tone = 'info'; renderSoon(true); return; }
    if (W.busyOp) { W.msg = 'ほかの作成が終わるまで、少し待ってください'; W.tone = 'info'; renderSoon(true); return; }
    if (!av2Idle()) { W.msg = '保存の確認中です。少し待ってからお試しください'; W.tone = 'info'; renderSoon(true); return; }
    W.msg = ''; W.tone = '';
    if (W.bulkPhase === 'select') {
      var needAI = sel.filter(function (r) { return !derive(r.cid).conf && !r.prop; });
      if (needAI.length) return bulkPropose(needAI);
    }
    /* review から、または案が要らない（確定済み／すでに案がある）→ 空の外見を確かめて走らせる */
    var empty = sel.filter(function (r) { return !derive(r.cid).conf && !preview(r.pg || '', r.pa || '').appearance; });
    if (empty.length) { W.msg = '外見の文が空のキャラがいます（' + empty.map(function (r) { return r.name; }).join('・') + '）。外見を入力するか、選ぶのをやめてください。'; W.tone = 'ng'; W.bulkPhase = 'review'; renderSoon(true); return; }
    bulkRun(sel);
  }
  function bulkPropose(list) {
    lock('bulk'); W.bulkPhase = 'propose'; var i = 0, id0 = sid(), a0 = acct();
    renderSoon(true);
    (function next() {
      if (i >= list.length) { W.bulkPhase = 'review'; W.msg = '外見の案ができました。直したいところがあれば直して、下のボタンを押してください（ここで押すまで、何も保存しません）。'; W.tone = 'info'; unlock(); return; }
      if (!same(id0, a0)) { W.bulkPhase = 'select'; W.msg = '物語またはアカウントが変わったので止めました。'; W.tone = 'ng'; unlock(); return; }
      var r = list[i++]; var d = derive(r.cid), P = PR();
      setRow(r, { phase: 'proposing', msg: '外見の案を作っています…', tone: 'info', fail: null });
      var input = { name: r.name, gender: d.castG, desc: d.desc, confirmed: '', context: lore().slice(0, 120), hero: r.hero };
      var fin = function (res) {
        res = res || {}; var g = genderOf(res.gender) || d.castG;
        r.prop = { ok: !!res.ok, code: res.code || null, appearance: res.appearance || '', original: res.base || '', last: res.appearance || '', gender: g, genderFixed: !!d.castG, added: res.added || [], dropped: res.dropped || [], aiCalled: !!res.aiCalled };
        r.pg = g; r.pa = r.prop.appearance; setRow(r, { phase: 'proposed', msg: '', tone: '' }); next();
      };
      if (P && typeof P.propose === 'function') { stats.ai++; P.propose(input, fin); } else fin({ ok: false, code: 'NO_MODULE', appearance: '', base: '', gender: d.castG });
    })();
  }
  function bulkRun(sel) {
    lock('bulk'); W.bulkPhase = 'run'; W.stop = false; W.msg = ''; W.tone = '';
    var id = sid(), a0 = acct(), i = 0, okN = 0, failN = 0;
    sel.forEach(function (r) { setRow(r, { phase: 'idle', msg: '待っています', tone: '', fail: null, ok: null, inRun: true, code: null }); });
    var finish = function (why) {
      W.bulkPhase = 'done'; W.stop = false;
      okN = sel.filter(function (r) { return r.ok === true; }).length; failN = sel.filter(function (r) { return r.phase === 'failed'; }).length;
      W.msg = (why ? why + ' ' : '') + '作った絵: ' + okN + ' 枚' + (failN ? '／うまくいかなかった人: ' + failN + ' 人' + (sel.some(function (r) { return r.phase === 'failed' && r.fail && (r.fail.retry || r.fail.fix || r.fail.unknown); }) ? '（その行のボタンから直せます）' : '') : '。');
      W.tone = failN || why ? 'info' : 'ok';
      W.lastSummary = sel.map(function (r) { return r.name + ': ' + (r.msg || ''); }).join(' / ');
      note({ kind: 'BULK_DONE', ok: okN, fail: failN, why: why || null });
      try { window.__chronicleAv2Portrait && window.__chronicleAv2Portrait.refresh && window.__chronicleAv2Portrait.refresh(); } catch (e) {}
      unlock();
    };
    var stopRest = function (from, text) { sel.slice(from).forEach(function (q) { if (q.ok !== true) setRow(q, { phase: 'idle', msg: text, tone: 'info' }); }); };
    var first = true;
    var next = function () {
      if (first) { first = false;
        var needSave = sel.some(function (r) { return !derive(r.cid).conf; });
        if (needSave) { W.msg = '保存の確認を待っています…'; W.tone = 'info'; renderSoon(true);
          return waitClean(id, 45000, function (ok) { W.msg = ''; if (!ok) { stopRest(0, '保存の確認が終わらなかったので作っていません'); return finish('この端末の保存がまだ確定していません。少し待ってから「まとめて絵を作る」をやり直してください。'); } next(); }); } }
      if (i >= sel.length) return finish(null);
      if (W.stop) { stopRest(i, 'やめました（作っていません）'); return finish('残りをやめました。'); }
      if (!same(id, a0)) { stopRest(i, '物語またはアカウントが変わったので作っていません'); return finish('物語またはアカウントが変わったので止めました。'); }
      var r = sel[i++]; var d = derive(r.cid);
      var after = function (o) {
        if (o && o.stop) { stopRest(i, '止めたので作っていません'); return finish('外見を保存できない状態だったので止めました。ページを再読み込みしてから、もう一度お試しください。'); }
        var code = (o && o.code) || r.code;
        if (o && o.result === 'fail' && (code === 'BUDGET' || code === 'RATE_LIMITED' || code === 'LEDGER_UNHEALTHY')) {
          stopRest(i, '止めたので作っていません');
          return finish(code === 'BUDGET' ? '画像の上限に達したので止めました。残りは作っていません。' : code === 'RATE_LIMITED' ? '混み合っていたので止めました。残りは少し時間をおいて、もう一度作ってください。' : '画像の作成を一時的に止めています。残りは作っていません。');
        }
        next();
      };
      if (!d.conf) {
        var pv = preview(r.pg || '', r.pa || '');
        if (!pv.appearance) { setRow(r, { phase: 'failed', ok: false, msg: '外見の文が空なので作っていません', tone: 'ng', fail: { code: 'EMPTY', kind: 'ef', stage: 'set', retry: true } }); return next(); }
        return waitIdle(15000, function () { commitThenDraw(r.cid, 'ef', pv, after); });
      }
      /* 確定済みの外見はそのまま使う（setProfile しない・黙って変えない）*/
      var g = { id: id, acct: a0 };
      setRow(r, { phase: 'checking', msg: '', tone: '', fail: null, kind: 'ef' });
      generate(r.cid, 'ef', g, null, function (m) { r.msg = m; r.tone = 'info'; renderSoon(true); }, function (ph) { setRow(r, { phase: ph, msg: '絵を作っています…', tone: 'info' }); }, function (x) { after({ result: applyResult(r, 'ef', x), code: x && x.code }); });
    };
    next();
  }

  /* ---------- 画面 ---------- */
  var WA = 'v292DfixLC1-wa', STY = 'v292DfixLC1-sty';
  function ensureStyle() {
    if (document.getElementById(STY)) return;
    var s = document.createElement('style'); s.id = STY;
    s.textContent =
      '#' + WA + '{border:1px solid #806040;border-radius:10px;background:#17171f;color:#eee;padding:10px 12px;margin:0 0 12px;font-size:13px;line-height:1.6}' +
      '#' + WA + ' .lc1-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px}' +
      '#' + WA + ' .lc1-ttl{font-weight:bold;flex:1;min-width:8em}' +
      '#' + WA + ' .lc1-row{border:1px solid #33333c;border-radius:8px;padding:6px 8px;margin:6px 0}' +
      '#' + WA + ' .lc1-line{display:flex;align-items:center;gap:8px;flex-wrap:wrap}' +
      '#' + WA + ' .lc1-name{font-weight:bold}' +
      '#' + WA + ' .lc1-st{color:#b8b8c4;font-size:12px;flex:1;min-width:6em}' +
      '#' + WA + ' .lc1-msg{font-size:12px;margin-top:2px;color:#c8c8d0}' +
      '#' + WA + ' .lc1-msg.ok{color:#9fd49f}#' + WA + ' .lc1-msg.ng{color:#f0a0a0}#' + WA + ' .lc1-msg.info{color:#e0c080}' +
      '#' + WA + ' .lc1-prop{margin-top:6px;padding:6px 8px;border:1px solid #806040;border-radius:8px;background:#1d1a14}' +
      '#' + WA + ' .lc1-prop textarea{display:block;width:100%;box-sizing:border-box;margin-top:4px;background:#1a1a22;border:1px solid #555;color:#eee;padding:6px;border-radius:4px;font-size:13px}' +
      '#' + WA + ' .lc1-prop select{background:#1a1a22;color:#eee;border:1px solid #555;border-radius:4px;font-size:13px;margin-left:6px;min-height:32px}' +
      '#' + WA + ' .lc1-sub{color:#aaa;font-size:11px;margin-top:3px}' +
      '#' + WA + ' button{background:#3a4a5a;border:1px solid #666;color:#fff;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:13px;margin:4px 6px 0 0;min-height:36px}' +
      '#' + WA + ' button.lc1-main{background:#3a6a5a}#' + WA + ' button.lc1-go{background:#3a6a5a}#' + WA + ' button:disabled{opacity:.5;cursor:default}' +
      '#' + WA + ' .lc1-chk input{width:20px;height:20px}' +
      '.lc1-detail-tg{background:#2a2a3a;border:1px solid #555;color:#ccc;padding:3px 10px;border-radius:4px;cursor:pointer;font-size:11px;margin:6px 0 0}' +
      '@media (max-width:980px){#' + WA + ' button{min-height:44px;padding:8px 14px}#' + WA + ' .lc1-chk input{width:24px;height:24px}.lc1-detail-tg{min-height:36px;padding:6px 12px}}';
    (document.head || document.documentElement).appendChild(s);
  }
  function stText(r, d, gs) {
    if (!d.known) return '絵の状態を確かめています…';
    var base = d.has ? '絵あり' : (r.cand ? '候補あり（絵はまだ採用されていません）' : '絵なし');
    if (r.phase === 'proposing') return base + '・外見の案を作成中';
    if (r.phase === 'saving') return base + '・外見を保存中';
    if (gs.phase === 'checking') return base + '・確認中';
    if (gs.phase === 'generating') return base + (d.has ? '・候補を作成中' : '・作成中');
    if (gs.phase === 'failed') return base + '・うまくいきませんでした';
    if (gs.phase === 'done') return d.has ? '絵あり' : base;
    return base + (d.conf ? '・外見は確定済み' : '');
  }
  function propHtml(r, d, bulk) {
    var p = r.prop; if (!p) return '';
    var h = '<div class="lc1-prop" data-lc1-prop="' + esc(r.cid) + '">' +
      '<div class="lc1-sub" style="color:#e0c080;font-size:12px">' + (p.editing ? '外見を直してください（確定済みの外見を変えるのは、下のボタンを押したときだけです）' : '外見の案（まだ確定していません。直してから押してください）') + '</div>' +
      '<label>性別<select data-lc1-g="' + esc(r.cid) + '"' + (p.genderFixed ? '' : '') + '><option value=""' + (!r.pg ? ' selected' : '') + '>未設定</option><option value="女性"' + (r.pg === '女性' ? ' selected' : '') + '>女性</option><option value="男性"' + (r.pg === '男性' ? ' selected' : '') + '>男性</option></select></label>' +
      '<textarea rows="3" maxlength="400" data-lc1-a="' + esc(r.cid) + '" placeholder="例: 黒髪の短髪、細身、灰色の着物">' + esc(r.pa == null ? p.appearance : r.pa) + '</textarea>';
    var sub = [];
    if (!p.ok) sub.push('AIの案は作れませんでした。' + (p.original ? 'あなたの設定にある見た目の語だけを入れてあります。' : '') + '外見を直接入力してもかまいません。');
    else if (p.aiCalled) sub.push('あなたが書いた語はそのままで、足りない所だけをAIが足しました。');
    else if (!p.editing) sub.push('設定の説明にある見た目の語をそのまま入れました。');
    if (p.dropped && p.dropped.length) sub.push('性格・経歴などの説明は含めていません。');
    if (sub.length) h += '<div class="lc1-sub" data-lc1-sub="' + esc(r.cid) + '">' + esc(sub.join(' ')) + '</div>';
    if (!bulk) h += '<button class="lc1-go" data-lc1="go" data-cid="' + esc(r.cid) + '">この外見で作る</button><button data-lc1="regen" data-cid="' + esc(r.cid) + '">案を作り直す</button><button data-lc1="cancel" data-cid="' + esc(r.cid) + '">やめる</button>';
    return h + '</div>';
  }
  function rowHtml(r) {
    var cid = r.cid, d = derive(cid), gs = genState(cid), busy = isBusy(r) || gs.phase === 'generating' || gs.phase === 'checking';
    var inBulk = W.bulk, bulkLive = W.bulkPhase === 'propose' || W.bulkPhase === 'run';
    var h = '<div class="lc1-row" data-lc1-row="' + esc(cid) + '"><div class="lc1-line">';
    if (inBulk && W.bulkPhase !== 'done' && d.known && !d.has) h += '<label class="lc1-chk"><input type="checkbox" data-lc1-chk="' + esc(cid) + '"' + (r.chk ? ' checked' : '') + (bulkLive || W.bulkPhase === 'review' ? ' disabled' : '') + '></label>';
    h += '<span class="lc1-name">' + esc(r.name) + (r.hero ? '（主人公）' : '') + '</span><span class="lc1-st" data-lc1-st="' + esc(cid) + '">' + esc(stText(r, d, gs)) + '</span>';
    var showMain = !busy && r.phase !== 'proposed' && d.known && !(inBulk && W.bulkPhase !== 'done' && !d.has);   /* まとめ作成が終わったら、残ったキャラの個別ボタンを戻す */
    if (showMain) {
      var lab = (r.cand && !d.has) ? '候補から選ぶ' : (d.has ? '絵を変える' : '絵を作る');
      h += '<button class="lc1-main" data-lc1="main" data-cid="' + esc(cid) + '"' + ((W.busyOp && W.busyOp !== 'op:' + cid) ? ' title="ほかの作成が終わるまで待ってください"' : '') + '>' + lab + '</button>';
    }
    h += '</div>';
    if (r.msg) h += '<div class="lc1-msg ' + esc(r.tone || '') + '" data-lc1-msg="' + esc(cid) + '">' + esc(r.msg) + '</div>';
    if (r.fail && r.phase === 'failed') {
      h += '<div>';
      if (r.fail.retry) h += '<button data-lc1="retry" data-cid="' + esc(cid) + '">もう一度</button>';
      if (r.fail.unknown) h += '<button data-lc1="check" data-cid="' + esc(cid) + '">結果を確かめる</button>';
      if (r.fail.fix) h += '<button data-lc1="fix" data-cid="' + esc(cid) + '">外見を直す</button>';
      h += '</div>';
    }
    if (r.phase === 'proposed') h += propHtml(r, d, inBulk);
    return h + '</div>';
  }
  function bulkBar() {
    var h = '', sel = selected(), n = sel.length, ph = W.bulkPhase;
    if (!W.bulk) return '';
    if (ph === 'select') {
      h += '<div class="lc1-sub">絵が採用されていないキャラを選んでいます（外せます）。絵がすでにあるキャラは、ここでは動きません。' + (n > COST_N ? '1 分に作れるのは ' + COST_N + ' 枚までなので、' + n + ' 人だと待ち時間が入ります。' : '') + (n ? '<br>選んだ ' + n + ' 人ぶん、1 人 1 枚ずつ作ります（画像生成 ' + n + ' 回）。' : '') + '</div>';
      h += '<button data-lc1="bulk-all">全員を選ぶ</button><button data-lc1="bulk-none">全員の選択を外す</button>';
      h += '<button class="lc1-go" data-lc1="bulk-go">' + (n ? n + '人の絵をまとめて作る' : '作るキャラを選んでください') + '</button><button data-lc1="bulk-close">閉じる</button>';
    } else if (ph === 'propose') {
      h += '<div class="lc1-sub">外見の案を 1 人ずつ作っています…（保存はまだしていません）</div>';
    } else if (ph === 'review') {
      h += '<div class="lc1-sub">1 人 1 枚ずつ作ります（画像生成 ' + n + ' 回）。採用済みの絵は変わりません。</div>';
      h += '<button class="lc1-go" data-lc1="bulk-go">この外見で ' + n + ' 人の絵を作る</button><button data-lc1="bulk-back">戻る</button>';
    } else if (ph === 'run') {
      h += '<button data-lc1="bulk-stop"' + (W.stop ? ' disabled' : '') + '>残りをやめる</button>';
    } else if (ph === 'done') {
      h += '<button data-lc1="bulk-close">閉じる</button>';
    }
    return h;
  }
  var lastRender = 0, renderTimer = null;
  function renderSoon(force) { if (force) { render(true); return; } if (renderTimer) return; renderTimer = setTimeout(function () { renderTimer = null; render(false); }, 60); }
  function editingNow(box) { var ae = document.activeElement; return !!(ae && box.contains(ae) && /^(TEXTAREA|INPUT|SELECT)$/.test(ae.tagName) && ae.type !== 'checkbox'); }
  function render(force) {
    var box = document.getElementById(WA); if (!box) return;
    if (!force && editingNow(box)) return;                       /* 入力中は差し替えない */
    /* ★ここで DOM→モデルの同期はしない（入力・チェックの変更は onInput/onChange と各ボタンの頭で同期済み）。
       render の頭で同期すると、openBulk の事前選択や「全員を選ぶ」でモデルに入れた値が、まだ古い DOM で上書きされて消える */
    var ae = document.activeElement, keep = null;
    if (ae && box.contains(ae) && ae.getAttribute) { var k = ae.getAttribute('data-lc1-a') ? 'a' : (ae.getAttribute('data-lc1-g') ? 'g' : null); if (k) keep = { k: k, cid: ae.getAttribute('data-lc1-' + k), s: ae.selectionStart, e: ae.selectionEnd }; }
    var cs = syncRows();
    var h = '<div class="lc1-head"><span class="lc1-ttl">🎨 登場人物の絵</span>';
    if (!W.bulk) h += '<button data-lc1="bulk-open">まとめて絵を作る</button>';
    h += '</div>';
    if (W.msg) h += '<div class="lc1-msg ' + esc(W.tone || '') + '" data-lc1-wmsg="1">' + esc(W.msg) + '</div>';
    h += bulkBar();
    h += '<div data-lc1-rows="1">' + cs.map(function (c) { return rowHtml(W.rows[c.id]); }).join('') + '</div>';
    if (W.needReload) h += '<div class="lc1-sub" data-lc1-reload-note="1">外見を保存しました。👥 を閉じると、表示を揃えるために 1 回だけ再読み込みします。</div>';
    box.innerHTML = h;
    W.sig = sigNow();
    if (keep) { var el = box.querySelector('[data-lc1-' + keep.k + '="' + keep.cid + '"]'); if (el) { try { el.focus(); if (keep.k === 'a' && keep.s != null) el.setSelectionRange(keep.s, keep.e); } catch (e) {} } }
  }
  function sigNow() {
    var parts = [W.bulk ? 1 : 0, W.bulkPhase, W.busyOp, W.msg, W.needReload ? 1 : 0, av2Idle() ? 1 : 0, W.ptr ? 1 : 0];
    Object.keys(W.rows).forEach(function (k) { var r = W.rows[k]; var d = derive(k); parts.push(k + ':' + r.phase + ':' + (d.has ? 1 : 0) + ':' + (d.conf ? 1 : 0) + ':' + (r.chk ? 1 : 0) + ':' + (r.cand ? 1 : 0) + ':' + (r.msg || '')); });
    return parts.join('|');
  }
  function onClick(e) {
    var t = e.target; if (!t || !t.closest) return; var b = t.closest('[data-lc1]'); if (!b || !b.parentNode) return;
    e.stopPropagation();
    var a = b.getAttribute('data-lc1'), cid = b.getAttribute('data-cid');
    if (b.disabled) return;
    switch (a) {
      case 'main': return pressMain(cid);
      case 'go': return pressGo(cid);
      case 'regen': return pressRegen(cid);
      case 'cancel': return pressCancel(cid);
      case 'retry': return pressRetry(cid);
      case 'check': return pressCheck(cid);
      case 'fix': return pressFix(cid);
      case 'bulk-open': return openBulk(true);
      case 'bulk-close': return closeBulk();
      case 'bulk-all': syncInputs(); Object.keys(W.rows).forEach(function (k) { var d = derive(k); if (d.known && !d.has) W.rows[k].chk = true; }); return render(true);
      case 'bulk-none': syncInputs(); Object.keys(W.rows).forEach(function (k) { W.rows[k].chk = false; }); return render(true);
      case 'bulk-go': return pressBulkGo();
      case 'bulk-back': W.bulkPhase = 'select'; W.msg = ''; Object.keys(W.rows).forEach(function (k) { var r = W.rows[k]; if (r.phase === 'proposed') { r.phase = 'idle'; r.prop = null; } }); return render(true);
      case 'bulk-stop': W.stop = true; W.msg = '今のキャラが終わったら止めます。'; W.tone = 'info'; return render(true);
    }
  }
  function onChange(e) { var t = e.target; if (!t || !t.getAttribute) return; syncInputs(); if (t.hasAttribute('data-lc1-chk')) render(true); }
  function onInput() { syncInputs(); }

  /* ---------- 「詳細 ▾」: 既存のカードの部品（呼び名・候補から選ぶ・外見を設定・削除）を畳む ---------- */
  function decorateCards() {
    var cards = document.querySelectorAll('.v292Dfix145-card');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i], box = card.querySelector('[data-av2-ui="card"]'); if (!box) continue;
      var name = card.getAttribute('data-name') || '';
      var tg = card.querySelector('.lc1-detail-tg');
      if (box.getAttribute('data-lc1-det') === '1' && tg) continue;
      var open = !!W.detailOpen[name];
      box.setAttribute('data-lc1-det', '1'); box.style.display = open ? '' : 'none';
      if (!tg) {
        tg = document.createElement('button'); tg.type = 'button'; tg.className = 'lc1-detail-tg'; tg.setAttribute('data-av2-ui', 'lc1-detail');
        box.parentNode.insertBefore(tg, box);
        tg.onclick = function (ev) { ev.stopPropagation(); var c = ev.currentTarget.closest('.v292Dfix145-card'); var bx = c && c.querySelector('[data-av2-ui="card"]'); if (!bx) return; var nm = c.getAttribute('data-name') || '';
          var now = bx.style.display === 'none'; bx.style.display = now ? '' : 'none'; W.detailOpen[nm] = now; ev.currentTarget.textContent = now ? '詳細 ▴' : '詳細 ▾'; };
      }
      tg.textContent = open ? '詳細 ▴' : '詳細 ▾';
      var pf = box.querySelector('[data-av2-prof="toggle"]'); if (pf && /外見を設定/.test(pf.textContent || '')) pf.textContent = '外見を編集';
    }
  }

  /* ---------- 一覧への付け直し ---------- */
  function attach() {
    var mo = modal(), wa = document.getElementById(WA);
    var on = doc() === true && sid() && chars().length > 0;
    if (!mo) { return; }
    if (!on) { if (wa && wa.parentNode) wa.parentNode.removeChild(wa); return; }
    var id = sid();
    if (W.id !== id) resetFor(id);
    ensureStyle();
    if (!wa || !mo.contains(wa)) {
      if (wa && wa.parentNode) wa.parentNode.removeChild(wa);
      wa = document.createElement('div'); wa.id = WA; wa.setAttribute('data-av2-ui', 'lc1'); wa.setAttribute('aria-label', '登場人物の絵');
      wa.addEventListener('click', onClick); wa.addEventListener('change', onChange); wa.addEventListener('input', onInput);
      var hdr = mo.querySelector('.v292Dfix145-search'); mo.insertBefore(wa, hdr || mo.firstChild);
      stats.attaches++;
      syncRows(); loadPtr(false);
      if (W.want) { var w = W.want; W.want = null; openBulk(!!w.preselect); }
      render(true);
    } else if (!W.sig || W.sig !== sigNow()) {
      render(false);
    }
    decorateCards();
  }

  /* ---------- 再読み込みの保留（portrait.js の afterSidePort から）---------- */
  function toastReload() {
    try { var d = document.createElement('div'); d.setAttribute('data-av2-ui', 'lc1-toast'); d.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483647;max-width:92vw;background:#222;color:#eee;border:1px solid #806040;border-radius:8px;padding:8px 12px;font-size:12px;line-height:1.6';
      d.textContent = '表示を揃えるため、1 回だけ再読み込みします'; (document.body || document.documentElement).appendChild(d); } catch (e) {}
  }
  function holdReload(res, msgEl) {
    if (!res || !res.ok || res.noop) return false;
    if (res.mirror !== 'PERSISTED_EQUALS_READBACK') return false;
    var active = !!modal() || !!W.busyOp;
    if (!active) return false;
    W.needReload = true; stats.held++; note({ kind: 'RELOAD_HELD' });
    if (msgEl && typeof msgEl.textContent === 'string') msgEl.textContent = (msgEl.textContent || '') + '（👥 を閉じると、表示を揃えるため 1 回だけ再読み込みします）';
    return true;
  }
  function watchReload() {
    if (!W.needReload || W.reloaded) return;
    if (modal() || W.busyOp || document.getElementById('v292Dav2-picker')) return;     /* 作業欄が開いている間・作成中・ピッカーを見ている間は待つ */
    if (busyDoc()) return;
    W.reloaded = true; stats.reloads++; note({ kind: 'RELOAD' });
    try { if (W.lastSummary) sessionStorage.setItem('v292DfixLC1_sum_' + (W.id || ''), JSON.stringify({ t: Date.now(), msg: W.lastSummary })); } catch (e) {}
    toastReload();
    setTimeout(function () { try { location.reload(); } catch (e) {} }, 1500);
  }
  function showSummary() {
    var id = sid(); if (!id) return false;
    var k = 'v292DfixLC1_sum_' + id, v = null; try { v = sessionStorage.getItem(k); if (v) sessionStorage.removeItem(k); } catch (e) {}
    if (!v) return true; var o = null; try { o = JSON.parse(v); } catch (e) {} if (!o || !o.msg || Date.now() - (+o.t || 0) > 120000) return true;
    try { var d = document.createElement('div'); d.id = 'v292DfixLC1-sum'; d.setAttribute('data-av2-ui', 'lc1-sum');
      d.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483000;max-width:92vw;background:#222;color:#eee;border:1px solid #806040;border-radius:8px;padding:8px 12px;font-size:12px;line-height:1.6';
      d.textContent = '登場人物の絵: ' + o.msg; (document.body || document.documentElement).appendChild(d); setTimeout(function () { try { d.parentNode.removeChild(d); } catch (e) {} }, 9000); } catch (e) {}
    return true;
  }

  /* ---------- B37 の案内からの入口 ---------- */
  function openFromB37(source) {
    if (doc() !== true || !sid()) return { ok: false, code: 'NOT_S2' };
    if (source === 'auto' && busyDoc()) return { ok: false, code: 'BUSY' };
    var id = sid(); if (W.id !== id) resetFor(id);
    loadPtr(true, function (ok) {
      if (!ok) return;
      if (source === 'auto' && !lacking().length) return;                  /* 全員に絵がある → 開かない */
      W.want = { preselect: source !== 'auto' };                            /* 自動は最初は全員チェックなし（B37 の決定を守る）*/
      try { if (window.__charlist && typeof window.__charlist.open === 'function') window.__charlist.open(); } catch (e) {}
    });
    return { ok: true };
  }

  function tick() {
    try { attach(); } catch (e) { note({ kind: 'ATTACH_THREW', e: String(e).slice(0, 80) }); }
    try { watchReload(); } catch (e) {}
  }
  var sumDone = false, n = 0;
  (function loop() { n++; if (!sumDone && n < 60) { try { sumDone = showSummary(); } catch (e) { sumDone = true; } } tick(); setTimeout(loop, 400); })();

  window.__v292DfixLC1 = {
    version: 'LC1-r1', on: function () { return true; }, holdReload: holdReload, openFromB37: openFromB37,
    genState: genState, useGenState: function (fn) { gsProvider = (typeof fn === 'function') ? fn : null; },
    openBulk: openBulk, openCandidates: openCandidates,
    status: function () {
      return { on: true, id: W.id, modal: !!modal(), wa: !!document.getElementById(WA), bulk: W.bulk, bulkPhase: W.bulkPhase, busyOp: W.busyOp, needReload: W.needReload, reloaded: W.reloaded, msg: W.msg,
        ptr: W.ptr ? Object.keys(W.ptr).length : null, stats: JSON.parse(JSON.stringify(stats)), calls: W.callTimes.length,
        rows: Object.keys(W.rows).map(function (k) { var r = W.rows[k]; var d = derive(k); return { cid: k, name: r.name, phase: r.phase, gs: genState(k).phase, has: d.has, conf: d.conf, chk: r.chk, cand: r.cand, msg: r.msg, code: r.code, fail: r.fail, kind: r.kind, hasProp: !!r.prop, propOk: r.prop ? r.prop.ok : null, pa: r.pa, pg: r.pg }; }),
        log: LOG.slice(-40) };
    }
  };
  try { console.log(TAG, 'loaded (ON)'); } catch (e) {}
})();
