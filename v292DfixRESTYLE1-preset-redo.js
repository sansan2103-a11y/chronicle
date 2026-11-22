/* =====================================================================
 * v292DfixRESTYLE1-preset-redo.js — 画風を変えたら、確認してから全員分を新しい画風で作り直す（★RESTYLE1・GPT #127-WJ ■3・2026-11-21・Local・既定 OFF）
 * ---------------------------------------------------------------------
 * ■やること（新しい通信経路は作らない。手動の「新しいデザインを生成（候補のみ）」→「この絵を採用」と同じ部品を、同じ順に呼ぶだけ）
 *   1) 画風（fg3 の 3 択 cfg.artPreset）がこのページで変わったら、サーバーに保存されるまで待つ（fix781 の印が CLEAN・fix705 の正本が新しい・
 *      portrait.list の current_preset が新しい画風）。
 *   2) 対象を数える: 登録人物（主人公・NPC・DELETED / DEPARTED は除く）のうち、外見が確定していて（profile.appearance あり）、
 *      新しい画風の採用画像（portrait.list の adopted_by_preset・profile_match が false でないもの）がまだ無い人。
 *   3) 画面内の帯で 1 回だけ聞く（prompt / confirm は使わない）:「この画風で ○ 人分を作り直しますか（画像 ○ 枚分）」[作り直す][今はしない]。
 *      「今はしない」→ 何もしない。同じ物語・同じ画風ではもう聞かない（端末の記録）。画風の欄に「この画風の絵を作る（○ 人）」の入口を残す。
 *   4)「作り直す」→ 1 人ずつ __chronicleAssetV2.newDraw（portrait.regenerate・候補 1 枚）→ adoptCandidate（portrait.adopt）。
 *      進み（○/○ 人）を帯に出す。[やめる] で次の送信を止める（送った分は戻さない＝作成済みは残る）。
 *      次の送信の前に毎回確かめ、どれかが変わっていたら止める: やめた・画風が変わった・物語が替わった・アカウントが替わった・Vault が施錠された・
 *      HOLD2 1b の待ち（120 秒を超えたら止める）。
 *      失敗した人は前の絵のまま（何も採用しない）で、帯に「未完成 ○ 人」と出す。上限・混雑・結果不明は全体を止める。
 *      止めたとき・終わったときは「○ 人分は作成済み（○ 人は未作成）」。
 *   5) 戻す: 画風を元に戻したときは作り直さない（費用 0・生成 0・adopt 0・サーバー書き込み 0）。表示は LD1（その画風の採用画像を読むだけで選ぶ）。
 *      RESTYLE1 が ON の端末では、LD1 は管理者の鍵に依らず ON になる（LD1 の gate の 1 か所）。外見を変えた後の旧画像（profile_match false）は戻さない（LD1 の規則）。
 * ■上限・守り: 1 回の作り直しの人数は LIM1 の「1 物語の枚数」（ADMF1.limit('starticon_story_imgs')・行なしは 4）まで。imgsafe・費用の上限・利用権は Worker のまま
 *   （regenerate は手動と同じ入口）。HOLD2 1b の待ちは STARTICON と同じ（matWait）。
 * ■Vault で隠した物語: STARTICON の VICON1 と同じ判定（__v292DfixVaultOpenWhy・1 か所）が '' のときだけ。使う外見は確定済みの profile だけ（説明文からは作らない）。
 * ■スイッチ: 既定 ON（2026-11-21 restyle1on・Owner の決定・実機確認後）。kill v292DfixRESTYLE1Off='1'（勝つ）。OFF・kill では何もしない（鍵 2 つを読むだけ）。
 * ■記録: localStorage 'v292DfixRESTYLE1_v1' に、物語 ID のハッシュごと・画風ごとの「聞いた／断った」だけ。名前・本文・ID そのものは残さない。
 * ■診断: window.__v292DfixRESTYLE1.status()（件数と理由コードだけ）
 * ===================================================================== */
(function (root) {
  'use strict';
  if (typeof window === 'undefined' || root.__v292DfixRESTYLE1) return;
  function lsGet(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { root.localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function on() { return lsGet('v292DfixRESTYLE1Off') !== '1'; }
  if (!on()) { root.__v292DfixRESTYLE1 = { on: false, status: function () { return { on: false }; } }; return; }
  var VER = 'restyle1-20261121-r2';
  var KEYS = ['beautiful', 'cool', 'dark'], LABEL = { beautiful: 'デフォルト', cool: 'クール', dark: 'ダーク' };
  var IDS = { beautiful: 'chronicle_beautiful_novel_v1@1', cool: 'chronicle_cool_stylish_v1@1', dark: 'chronicle_dark_vn_v1@1' };   /* = LD1 / Worker ART_PRESET_IDS */
  var RK = 'v292DfixRESTYLE1_v1', POLL = 1500, SAVE_WAIT_MS = 60000, HOLD_WAIT_MS = 120000;
  var STOP_ALL = { BUDGET: 1, RATE_LIMITED: 1, LEDGER_UNHEALTHY: 1, ASSET_V2_UNAVAILABLE: 1, NOT_FOUND: 1, OUTCOME_UNKNOWN: 1, AV2_OFF: 1, AV2_FLAG_OFF: 1, NOT_SCHEMA2_DOCUMENT: 1, REGISTRATION_IN_PROGRESS: 1, REBASE_REQUIRED: 1, REGISTRATION_BLOCKED: 1 };
  var stats = { changes: 0, asked: 0, declined: 0, started: 0, gen: 0, adopted: 0, existing: 0, failed: 0, stopped: {}, skip: {}, fail: {} };
  function cnt(m, k) { k = String(k || 'X').slice(0, 40); m[k] = (m[k] || 0) + 1; }
  function hk(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; } return 'h' + h.toString(36); }
  function rec() { try { var o = JSON.parse(lsGet(RK) || 'null'); if (o && o.v === 1 && o.s && typeof o.s === 'object') return o; } catch (e) {} return { v: 1, s: {} }; }
  function recSet(id, key, val) { var r = rec(), h = hk(id); var x = r.s[h] = r.s[h] || {}; x[key] = val; x.at = Date.now();
    var ks = Object.keys(r.s); if (ks.length > 100) { ks.sort(function (a, b) { return (r.s[a].at || 0) - (r.s[b].at || 0); }); for (var i = 0; i < ks.length - 100; i++) delete r.s[ks[i]]; }
    lsSet(RK, JSON.stringify(r)); }
  function recGet(id, key) { var x = rec().s[hk(id)]; return x ? x[key] : undefined; }
  function state() { try { return (typeof root.__chronicleGetState === 'function') ? root.__chronicleGetState('restyle1') : null; } catch (e) { return null; } }
  function sid() { try { var f = root.__v292Dfix697; var s = f && f.status ? f.status().storyId : null; return s ? String(s) : null; } catch (e) { return null; } }
  function acct() { try { var F = root.__v292Dfix893; var me = (F && typeof F.me === 'function') ? F.me() : null; return (me && me.accountId) ? String(me.accountId) : null; } catch (e) { return null; } }
  function doc2() { try { var m = root.__v292Dav2Map; return !!(m && typeof m.docSchema2 === 'function' && m.docSchema2() === true); } catch (e) { return false; } }
  function presetKey() { var S = state(); if (!S || !S.cfg) return null; if (!Object.prototype.hasOwnProperty.call(S.cfg, 'artPreset') || S.cfg.artPreset === undefined) return 'dark'; var v = S.cfg.artPreset; return KEYS.indexOf(v) >= 0 ? v : null; }
  function A() { return root.__chronicleAssetV2 || null; }
  function F697() { return root.__v292Dfix697 || null; }
  function vaultHidden(id) { try { var G = root.__v292DfixVAULTGATE2; if (G && typeof G.hidden === 'function') { var hv = G.hidden(id); if (hv === false) VGX[id] = 'visible'; return hv !== false; } }   /* r2: remember 'visible' (vgAuth / vgSticky) */ catch (e) { return true; } try { if (root.localStorage.getItem('v292DfixVAULTGATE2Off') !== '1') return true; } catch (e) { return true; }   /* ★VAULTGATE2 r2: kill していないのに部品が無い = 隠した物語かもしれない（止める） */ try { var V = root.__v292Dfix889; if (!V || typeof V.isHidden !== 'function') return true; return !!V.isHidden(id); } catch (e) { return true; } }   /* ★VAULTGATE2: vault2 と fix889 の両方（1 か所） */   /* fail-closed */
  var VG_WAIT_MS = 60000; function vgUnknown(id) { try { var G = root.__v292DfixVAULTGATE2; return !!(G && typeof G.state === 'function' && G.state(id) === 'unknown'); } catch (e) { return false; } }   /* ★VAULTGATE2 r2b */
  function vaultWhy(id) { if (!vaultHidden(id)) return ''; try { var f = root.__v292DfixVaultOpenWhy; if (typeof f !== 'function') return 'NO_VAULT_GATE'; return f(id) || ''; } catch (e) { return 'THREW'; } }   /* = STARTICON VICON1 の判定（1 か所） */
  function saved(id) {
    try { var F5 = root.__v292Dfix705; var d = F5 && typeof F5.docAuthority === 'function' ? F5.docAuthority() : null;
      if (!(d && String(d.id) === String(id) && d.fresh === true && d.present === true && String(d.authority || '') === 'canonical' && d.schema === 2)) return false;
      var F = root.__v292Dfix781; var m = (F && typeof F.marker === 'function') ? F.marker(id) : null; return !!(m && m.state === 'CLEAN' && !m.inFlightSave); } catch (e) { return false; } }
  function inFlight() { var S = state(); return !!(S && S.inFlight); }
  function holdWhy(id) { try { var H = root.__v292DfixHOLD2; return (H && typeof H.matWait === 'function') ? (H.matWait(id) || '') : ''; } catch (e) { return 'threw'; } }
  function capN() { try { var X = root.__v292DfixADMF1; var n = (X && typeof X.limit === 'function') ? X.limit('starticon_story_imgs', null) : null; if (n === null || n === undefined) return 4; return n === Infinity ? Infinity : Math.max(0, +n || 0); } catch (e) { return 4; } }
  function people() {
    var S = state(); if (!S || !S.cast) return []; var c = S.cast, out = [];
    var add = function (e, hero) { if (!e || typeof e !== 'object' || typeof e.character_id !== 'string') return; if (e.status === 'DELETED' || e.status === 'DEPARTED') return;
      var p = e.profile; var ok = !!(p && typeof p === 'object' && typeof p.appearance === 'string' && p.appearance.trim()); out.push({ id: e.character_id, hero: !!hero, confirmed: ok }); };
    add(c.hero, true); (Array.isArray(c.npcs) ? c.npcs : []).forEach(function (n) { add(n, false); });
    return out;
  }
  function readList(id, cb) { var F = F697(); if (!F || typeof F.assetV2Read !== 'function') return cb(null);
    F.assetV2Read('portrait.list', { story_id: id }, function (r, err) { var j = r && r.j; if (err || !r || r.status !== 200 || !j || !Array.isArray(j.portraits)) return cb(null); cb(j); }); }
  /* 新しい画風の採用画像が（外見が変わっていない形で）ある人 = 作らない */
  function hasPreset(j, cid, pid) { if (!Array.isArray(j.adopted_by_preset)) return null;
    return j.adopted_by_preset.some(function (e) { return e && e.character_id === cid && e.preset === pid && e.profile_match !== false; }); }

  var X = { seen: null, story: null, phase: 'idle', job: null, last: null, entry: null };
  /* ---------- UI（画面内の帯・画風の欄の入口）---------- */
  var BAR = 'v292-restyle1-bar', ENT = 'v292-restyle1-entry';
  function anchorEl() { return document.getElementById('v292-artpreset-wrap'); }
  function bar() { var b = document.getElementById(BAR); if (b) return b; b = document.createElement('div'); b.id = BAR; b.setAttribute('data-av2-ui', 'restyle1'); b.setAttribute('role', 'status');
    b.style.cssText = 'position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:2147481000;max-width:min(560px,calc(100vw - 24px));background:#2b2620;color:#f4ece0;border:1px solid #a08050;border-radius:8px;padding:8px 12px;font-size:13px;line-height:1.5;box-shadow:0 2px 10px rgba(0,0,0,.4);';
    (document.body || document.documentElement).appendChild(b); return b; }
  function btn(txt, act) { var x = document.createElement('button'); x.type = 'button'; x.textContent = txt; x.setAttribute('data-restyle1', act); x.style.cssText = 'margin:6px 8px 0 0;background:#f4ece0;color:#3a2600;-webkit-text-fill-color:#3a2600;opacity:1;font-weight:600;border:0;border-radius:6px;padding:4px 12px;font-size:13px;cursor:pointer;'; return x; }
  function show(msg, acts) { var b = bar(); b.textContent = ''; var t = document.createElement('div'); t.setAttribute('data-restyle1', 'msg'); t.textContent = msg; b.appendChild(t);
    (acts || []).forEach(function (a) { b.appendChild(btn(a[0], a[1])); }); }
  function hide() { var b = document.getElementById(BAR); if (b && b.parentNode) b.parentNode.removeChild(b); }
  function entry(n, key) { var w = anchorEl(), e = document.getElementById(ENT);
    if (!n || !w || X.phase === 'running' || X.phase === 'ask') { if (e && e.parentNode) e.parentNode.removeChild(e); return; }
    if (!e) { e = btn('', 'entry'); e.id = ENT; e.style.margin = '0 0 0 6px'; e.style.padding = '2px 8px'; e.style.fontSize = '11px'; w.appendChild(e); }
    var txt = 'この画風の絵を作る（' + n + ' 人）'; if (e.textContent !== txt) e.textContent = txt; e.setAttribute('data-key', key); }
  document.addEventListener('click', function (ev) { var t = ev.target && ev.target.closest ? ev.target.closest('[data-restyle1]') : null; if (!t) return; var a = t.getAttribute('data-restyle1');
    if (a === 'yes') { ev.preventDefault(); start(); } else if (a === 'no') { ev.preventDefault(); decline(); } else if (a === 'stop') { ev.preventDefault(); if (X.job) { X.job.stop = 'USER_STOP'; show('止めています（送信中の 1 人が終わったら止まります）…', []); } }
    else if (a === 'close') { ev.preventDefault(); hide(); } else if (a === 'entry') { ev.preventDefault(); askFromEntry(); } }, true);

  /* ---------- 流れ ---------- */
  function msgAsk(key, n) { return 'この画風（' + LABEL[key] + '）の絵が無い人が ' + n + ' 人います。この画風で ' + n + ' 人分を作り直しますか。今の絵は、作り直すまでそのままです。'; }
  function count(id, key, cb) {
    readList(id, function (j) {
      if (!j) { cnt(stats.skip, 'READ_FAIL'); return cb(null, 'READ_FAIL'); }
      if (!Array.isArray(j.adopted_by_preset)) { cnt(stats.skip, 'NO_PRESET_VIEW'); return cb(null, 'NO_PRESET_VIEW'); }   /* Worker が画風ごとの採用画像を返さない → 作らない */
      if (j.current_preset !== IDS[key]) return cb(null, 'NOT_SAVED');
      var pid = IDS[key], tg = [], noConf = 0;
      people().forEach(function (p) { if (hasPreset(j, p.id, pid)) return; if (!p.confirmed) { noConf++; return; } tg.push(p); });
      tg.sort(function (a, b) { return (b.hero ? 1 : 0) - (a.hero ? 1 : 0); });
      var cap = capN(); if (cap !== Infinity && tg.length > cap) tg = tg.slice(0, cap);
      cb({ targets: tg, noConf: noConf }, null);
    });
  }
  function decline() { var k = X.ask; if (!k) return hide(); recSet(k.id, 'd_' + k.key, 'declined'); stats.declined++; X.phase = 'idle'; X.ask = null; hide(); }
  function askFromEntry() { var id = sid(), key = presetKey(); if (!id || !key || X.phase === 'running') return;
    count(id, key, function (r, why) { if (!r) return; if (!r.targets.length) return entry(0, key); X.phase = 'ask'; X.ask = { id: id, key: key, a: acct(), targets: r.targets }; stats.asked++; entry(0, key); show(msgAsk(key, r.targets.length), [['作り直す', 'yes'], ['今はしない', 'no']]); }); }
  function stillOk(job) {
    if (job.stop) return job.stop;
    if (presetKey() !== job.key) return 'PRESET_CHANGED';
    if (sid() !== job.id) return 'STORY_CHANGED';
    if (acct() !== job.a) return 'ACCOUNT_CHANGED';
    if (!doc2()) return 'NOT_SCHEMA2';
    var vw = vgSticky(job.id) ? '' : vaultWhy(job.id); if (vw) return 'VAULT_' + vw;   /* r2: a visible story goes on while the answer is only being re-read */
    return '';
  }
  function finish(job, why) {
    X.phase = 'idle'; X.job = null; if (why) cnt(stats.stopped, why); X.wait = { key: job.key, t0: Date.now() };   /* 数え直して入口の人数を合わせる（同じ画風ではもう聞かない） */
    var done = job.done, fail = job.fails, had = job.had || 0, total = job.targets.length, rest = total - done - fail - had;
    var m = (why ? '止めました。' : '作り直しが終わりました。') + done + ' 人分は作成済み' + (had ? '・' + had + ' 人は既にあり' : '') + (fail ? '・' + fail + ' 人は未完成（前の絵のまま）' : '') + (rest > 0 ? '・' + rest + ' 人は未作成' : '') + '。';
    show(m, [['閉じる', 'close']]);
    try { var P = root.__chronicleAv2Portrait; if (P && typeof P.refresh === 'function') P.refresh(); } catch (e) {}
  }
  function start() {
    var k = X.ask; if (!k) return; X.ask = null;
    var job = { id: k.id, key: k.key, a: k.a, targets: k.targets, i: 0, done: 0, fails: 0, had: 0, stop: null, gf: 0 };
    if (stillOk(job)) { X.phase = 'idle'; return finish(job, stillOk(job)); }
    X.phase = 'running'; X.job = job; stats.started++; recSet(job.id, 'd_' + job.key, 'started');
    step(job);
  }
  function progress(job) { show('この画風（' + LABEL[job.key] + '）で作り直しています: ' + (job.done + job.fails + job.had) + '/' + job.targets.length + ' 人' + (job.had ? '（既にあり ' + job.had + ' 人）' : '') + (job.fails ? '（未完成 ' + job.fails + ' 人）' : '') + '。', [['やめる', 'stop']]); }
  function step(job) {
    var why = stillOk(job); if (why) return finish(job, why);
    if (job.i >= job.targets.length) return finish(job, null);
    progress(job);
    var t0 = Date.now();
    (function wait() {
      var w2 = stillOk(job); if (w2) return finish(job, w2);
      var h = holdWhy(job.id); if (h) { if (Date.now() - t0 > HOLD_WAIT_MS) return finish(job, 'HOLD2_' + String(h).slice(0, 16)); return setTimeout(wait, POLL); }
      if (inFlight()) { if (Date.now() - t0 > HOLD_WAIT_MS) return finish(job, 'IN_FLIGHT'); return setTimeout(wait, POLL); }
      /* ★r2（レビュー）: 送る直前に portrait.list を読み直す。別のタブ・再読み込みの後などで、この人に新しい画風の採用画像（profile_match が false でない）が既にあれば送らない（既にあり）。
         読めない・分からないときは、その人に送らず全体を止める（費用を重ねない側へ倒す） */
      var c = job.targets[job.i];
      readList(job.id, function (j) {
        var w4 = stillOk(job); if (w4) return finish(job, w4);
        if (!j || !Array.isArray(j.adopted_by_preset) || j.current_preset !== IDS[job.key]) return finish(job, 'RECHECK_FAIL');
        job.i++;
        if (hasPreset(j, c.id, IDS[job.key])) { job.had++; stats.existing++; return setTimeout(function () { step(job); }, 0); }
        send(job, c);
      });
    })();
  }
  /* ★VAULTSEND1: right before a send, a FRESH answer (VAULTGATE2.authorize) must match what this module decided (visible, or hidden and open).
     The kept answer (state / hidden) is for display and for deciding whether to start; never alone for the send. */
  /* r2 (review): the expected answer is the one this module started with — VGX[id] = 'visible' once VAULTGATE2 said 'not hidden' (it never turns back
     to visible by itself). While the kept answer is only 'unknown' (a HOME hide / unhide / lock signal, a re-read), a story that was visible goes on (vgSticky);
     every send still needs the FRESH authorize() === 'visible' (a story hidden meanwhile is stopped there). */
  var VGX = {};
  function vgSticky(id) { try { var G = root.__v292DfixVAULTGATE2; return VGX[id] === 'visible' && !!G && typeof G.state === 'function' && G.state(id) === 'unknown'; } catch (e) { return false; } }
  function vgAuth(id, go, stop) { var exp; try { exp = VGX[id] === 'visible' ? 'visible' : (vaultHidden(id) ? 'open' : 'visible'); } catch (e) { return stop('THREW'); }
    var G = root.__v292DfixVAULTGATE2; if (!G || typeof G.authorize !== 'function') return stop('NO_VAULT_GATE');
    Promise.resolve().then(function () { return G.authorize(id); }).then(function (a) { if (a === exp) go(); else stop(String(a || 'unknown').toUpperCase().slice(0, 16)); }, function () { stop('THREW'); }); }
  function send(job, c) {
      if (!c.__vgOk) return vgAuth(job.id, function () { send(job, Object.assign({}, c, { __vgOk: 1 })); }, function (w) { cnt(stats.skip, 'VAULT_AUTH_' + w); finish(job, 'VAULT_AUTH'); });   /* ★VAULTSEND1 */
      stats.gen++;
      A().newDraw(c.id, { ownerExplicit: true }, function (r) {
        r = r || {};
        if (!r.ok || !r.candidate) {
          var code = String(r.code || 'UNKNOWN'); cnt(stats.fail, code); stats.failed++; job.fails++;
          if (STOP_ALL[code]) return finish(job, code);
          if (code === 'GENERATION_FAILED' && ++job.gf >= 2) return finish(job, 'GENERATION_FAILED2');
          return setTimeout(function () { step(job); }, 300);
        }
        job.gf = 0;
        var w3 = stillOk(job); if (w3 && w3 !== 'USER_STOP') { cnt(stats.fail, 'NOT_ADOPTED_' + w3); job.fails++; stats.failed++; return finish(job, w3); }   /* 候補は残る（手動で選べる）。採用しない */
        A().adoptCandidate(c.id, r.candidate, function (r2) {
          r2 = r2 || {};
          if (r2.ok) { job.done++; stats.adopted++; }
          else { cnt(stats.fail, 'ADOPT_' + String(r2.code || 'UNKNOWN')); job.fails++; stats.failed++; }
          try { var P = root.__chronicleAv2Portrait; if (P && typeof P.refresh === 'function') P.refresh(); } catch (e) {}
          setTimeout(function () { step(job); }, 300);
        });
      });
  }
  /* ---------- 見張り（画風の変化 → 保存を待つ → 数える → 聞く）---------- */
  function tick() {
    try {
      var id = sid(), key = presetKey();
      if (!id || !doc2() || !key) { entry(0, null); return; }
      if (X.story !== id) { X.story = id; X.seen = key; X.wait = null; if (X.phase === 'ask') { X.phase = 'idle'; X.ask = null; hide(); } }
      if (X.phase === 'running') return;
      if (key !== X.seen) { X.seen = key; stats.changes++; X.wait = { key: key, t0: Date.now() }; if (X.phase === 'ask') { X.phase = 'idle'; X.ask = null; hide(); } }
      if (X.wait && X.phase === 'idle') {
        var wv = vaultWhy(id); if (wv) { if (vgUnknown(id)) { if (Date.now() - X.wait.t0 <= VG_WAIT_MS) return; wv = 'UNKNOWN_TIMEOUT'; } cnt(stats.skip, 'VAULT_' + wv); X.wait = null; return; }   /* ★VAULTGATE2 r2b: 未確定（読み直し待ち）は最終の見送りにしない。確定するまで待つ（上限 60 秒） */
        if (Date.now() - X.wait.t0 > SAVE_WAIT_MS) { cnt(stats.skip, 'SAVE_TIMEOUT'); X.wait = null; return; }
        if (!saved(id) || X.counting) return;
        X.counting = true; var wk = X.wait.key;
        return count(id, wk, function (r, why) {
          X.counting = false;
          if (!r) { if (why !== 'NOT_SAVED') X.wait = null; return; }   /* サーバーにまだ画風が無い → 次の tick でもう一度 */
          X.wait = null; X.entryN = r.targets.length; X.entryKey = wk;
          if (!r.targets.length || presetKey() !== wk || sid() !== id) return;
          if (recGet(id, 'd_' + wk)) { cnt(stats.skip, 'ASKED_BEFORE'); return entry(r.targets.length, wk); }   /* 同じ画風ではもう聞かない（入口だけ） */
          X.phase = 'ask'; X.ask = { id: id, key: wk, a: acct(), targets: r.targets }; stats.asked++; recSet(id, 'd_' + wk, 'asked');
          show(msgAsk(wk, r.targets.length), [['作り直す', 'yes'], ['今はしない', 'no']]);
        });
      }
      if (X.phase === 'idle' && X.entryKey === key && X.entryN) entry(X.entryN, key); else if (X.entryKey !== key) entry(0, null);
    } catch (e) { cnt(stats.skip, 'THREW'); }
  }
  setInterval(tick, POLL); setTimeout(tick, 0);
  root.__v292DfixRESTYLE1 = { on: true, ver: VER,
    status: function () { var j = X.job; return { on: true, ver: VER, phase: X.phase, job: j ? { key: j.key, total: j.targets.length, done: j.done, fails: j.fails, stop: j.stop } : null, stats: JSON.parse(JSON.stringify(stats)) }; } };
})(typeof window !== 'undefined' ? window : this);
