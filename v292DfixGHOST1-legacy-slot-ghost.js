/* =====================================================================
 * v292DfixGHOST1-legacy-slot-ghost.js — 旧固定スロットの「幽霊」（スロット A / B / C）を HOME の一覧から片づける
 * ---------------------------------------------------------------------
 * 症状: HOME に「スロット A」（0 ターン・未開始・この端末のみ・キャラ無し）が残り、削除シートでは
 *   「クラウドでこの物語を確認できないため、ここでは削除できません」と断られる。
 * 原因: features.js の旧 fix30 は chr6_slots_meta が空のとき default / a / b / c の 4 行を自動で作る
 *   （name 'スロット A' など・本文なし）。本文 chr6_slot_a が一度も作られなかった行は、HOME の一覧
 *   （chr6_slots_meta をそのまま並べる。'default' だけは 0 ターンなら隠す）に残り続ける。
 *   DL2 の削除はサーバーの一覧に無い物語を断る（Vault で隠した物語と区別できないため）。この断りは正しく、弱めない。
 * この fix がすること（HOME だけ・読み込み時に 1 回・冪等）:
 *   次の条件を **すべて** 満たす meta 行だけを chr6_slots_meta から外す（ほかの行・本文・サイドストア・墓標には触れない）。
 *     1. id が旧固定スロットの 'a' / 'b' / 'c'（features.js fix30 の SLOT_IDS）。
 *        'default' は外さない（すでに 0 ターンなら一覧に出ない。fix30 の activeSlot() の既定先 getMeta()[0] と
 *        互換キー 'chr6' の持ち主なので、消すと旧経路の挙動が変わる）。新しい id（s + base36）は対象外。
 *     2. 行の形が fix30 の自動作成のまま: name === 'スロット ' + 大文字 id、key は無いか 'chr6_slot_<id>'。
 *     3. 墓標ではない（deleted / deleteOpId なし・fix579.isTombstone も false）。
 *     4. この端末に本文が無い（chr6_slot_<id> が無い）＝ 0 ターン。
 *     5. クラウドの痕跡が無い（fix889 の「この端末だけ」の証明と同じ材料）: meta 行に serverHash / cloudRev /
 *        authority / canonicalRev / syncedAt / rev / cloud が無い・v292Dfix402_storyRevs に id が無い・
 *        v292Dfix402_f781g_<id> が無い・v292Dfix702_storyAuth に id が無い。
 *     6. Vault に関わらない: chr6_vault_hidden の hidden / visible に無い・fix889.isHidden(id) が false・
 *        fix889.hiddenIds() に無い・chr6_storysess_<id>（パスコード）が localStorage / sessionStorage に無い。
 *     7. 物語の履歴が無い: スナップショット chr6_snap_<id>_* / 控え v292Dfix945_rescue_<id> が無い・
 *        削除の計画 v292Dfix587_pending / v292Dfix587_blocked に "<id>" が無い。
 *     8. どのタブでも開かれていない: chr6_active_slot が id でない・meta の lastOpenedAt が 10 分以内でない。
 *     9. サーバーの一覧（listshadow・読むだけ）を 1 回読めて、その id の行が **無い**（削除済み・shadow も含めて無い）。
 *        読めない・未ログイン・アカウント方式でない画面では何もしない（今日と同じ）。
 *    10. 外した後も chr6_slots_meta が空にならない（空になると fix30 が 4 行を作り直す）。
 *   外したら v292DfixGHOST1Log に { at, ids } だけを残し（最大 20 件）、HOME の一覧を描き直す。
 * しないこと: 削除の要求・墓標・本文やサイドストアの削除・同期（put / pull）・新しい物語の作成。サーバーへは読み 1 回だけ
 *   （候補があるときだけ）。Vault・DL2・fix933 の判定は 1 行も変えない。
 * kill: localStorage v292DfixGHOST1Off = '1' → 何もしない（隠さない・外さない・サーバーも読まない）。
 * 観測: window.__v292DfixGHOST1.status()
 * ===================================================================== */
(function () {
  'use strict';
  if (window.__v292DfixGHOST1) return;
  var VERSION = 'GHOST1-r1';
  var META = 'chr6_slots_meta', LOG = 'v292DfixGHOST1Log', KILL = 'v292DfixGHOST1Off';
  var LEGACY = { a: 1, b: 1, c: 1 };
  var CLOUD_FIELDS = ['serverHash', 'cloudRev', 'authority', 'canonicalRev', 'syncedAt', 'rev'];
  var RECENT_OPEN_MS = 10 * 60 * 1000;
  var st = { version: VERSION, off: false, phase: 'init', candidates: [], skipped: {}, removed: [], code: null, at: 0 };

  function lsg(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function ssg(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function off() { return lsg(KILL) === '1'; }
  function isArr(a) { return Object.prototype.toString.call(a) === '[object Array]'; }
  function J(s, d) { try { return JSON.parse(s); } catch (e) { return d; } }
  function has(o, k) { return !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k); }

  /* 1 行について、外してよいなら null、だめなら理由（短い code）を返す。ネットワークは見ない。 */
  function localReason(e, meta) {
    if (!e || typeof e !== 'object') return 'bad-row';
    var id = String(e.id == null ? '' : e.id);
    if (!LEGACY[id]) return 'not-legacy';
    if (e.name !== 'スロット ' + id.toUpperCase()) return 'renamed';
    if (e.key != null && e.key !== 'chr6_slot_' + id) return 'key-shape';
    if (e.deleted === true || e.deleteOpId != null) return 'tombstone';
    try { var T = window.__v292Dfix579; if (T && typeof T.isTombstone === 'function' && T.isTombstone(e)) return 'tombstone'; } catch (x) { return 'tombstone-check-threw'; }
    var n = 0; for (var i = 0; i < meta.length; i++) if (meta[i] && String(meta[i].id) === id) n++;
    if (n !== 1) return 'dup-row';
    if (lsg('chr6_slot_' + id) != null) return 'has-body';
    for (var c = 0; c < CLOUD_FIELDS.length; c++) if (has(e, CLOUD_FIELDS[c]) && e[CLOUD_FIELDS[c]] != null && e[CLOUD_FIELDS[c]] !== '') return 'cloud-field';
    if (e.cloud === true) return 'cloud-field';
    var revsRaw = lsg('v292Dfix402_storyRevs');
    if (revsRaw != null) { var revs = J(revsRaw, null); if (!revs || typeof revs !== 'object') return 'ledger-unreadable'; if (has(revs, id)) return 'ledger'; }
    if (lsg('v292Dfix402_f781g_' + id) != null) return 'sync-marker';
    var authRaw = lsg('v292Dfix702_storyAuth');
    if (authRaw != null) { var au = J(authRaw, null); if (!au || typeof au !== 'object') return 'auth-unreadable'; if (has(au, id)) return 'authority'; }
    var vh = lsg('chr6_vault_hidden');
    if (vh != null) {
      var v = J(vh, null); if (!v || typeof v !== 'object') return 'vault-cache-unreadable';
      var lists = [v.hidden, v.visible];
      for (var L = 0; L < lists.length; L++) if (isArr(lists[L])) for (var j = 0; j < lists[L].length; j++) if (String(lists[L][j]) === id) return 'vault';
    }
    try {
      var F = window.__v292Dfix889;
      if (F && typeof F.isHidden === 'function' && F.isHidden(id)) return 'vault';
      if (F && typeof F.hiddenIds === 'function') { var hs = F.hiddenIds() || []; for (var h = 0; h < hs.length; h++) if (String(hs[h]) === id) return 'vault'; }
    } catch (x) { return 'vault-check-threw'; }
    if (lsg('chr6_storysess_' + id) != null || ssg('chr6_storysess_' + id) != null) return 'passcode';
    if (lsg('v292Dfix945_rescue_' + id) != null) return 'rescue';
    var q = '"' + id + '"';
    var p1 = lsg('v292Dfix587_pending'), p2 = lsg('v292Dfix587_blocked');
    if ((p1 && p1.indexOf(q) >= 0) || (p2 && p2.indexOf(q) >= 0)) return 'delete-plan';
    try {
      for (var k = 0; k < localStorage.length; k++) {
        var kk = localStorage.key(k) || '';
        if (kk.indexOf('chr6_snap_' + id + '_') === 0 || kk.indexOf('chr6_snapd_' + id + '_') === 0) return 'snapshot';
      }
    } catch (x) { return 'enum-threw'; }
    var act = lsg('chr6_active_slot');
    if (act != null && (act === id || J(act, null) === id)) return 'active-slot';
    var lo = e.lastOpenedAt ? Date.parse(e.lastOpenedAt) : 0;
    if (lo && Date.now() - lo < RECENT_OPEN_MS) return 'recently-opened';
    return null;
  }
  function scan() {
    var raw = lsg(META);
    if (raw == null) return { raw: raw, meta: null, ok: [], skipped: {} };
    var meta = J(raw, null);
    if (!isArr(meta)) return { raw: raw, meta: null, ok: [], skipped: { _meta: 'unreadable' } };
    var ok = [], skipped = {};
    for (var i = 0; i < meta.length; i++) {
      var e = meta[i]; if (!e || !LEGACY[String(e.id)]) continue;
      var r = localReason(e, meta);
      if (r) skipped[String(e.id)] = r; else ok.push(String(e.id));
    }
    return { raw: raw, meta: meta, ok: ok, skipped: skipped };
  }
  function listBasis(cb) {
    var W = null; try { W = window.__v292Dfix697; } catch (e) { W = null; }
    if (!W || typeof W.listShadowBasisOnce !== 'function') { cb(null, 'NO_PORT'); return; }
    try { W.listShadowBasisOnce(function (rows, err) { cb(rows || null, rows ? null : (err || 'LIST_FAIL')); }); }
    catch (e) { cb(null, 'THREW'); }
  }
  function writeLog(ids) {
    try {
      var a = J(lsg(LOG), []); if (!isArr(a)) a = [];
      a.push({ at: new Date().toISOString(), ids: ids.slice() });
      while (a.length > 20) a.shift();
      localStorage.setItem(LOG, JSON.stringify(a));
    } catch (e) {}
  }
  function apply(serverIds) {
    /* ★読み直してから判定し直す（サーバーを読んでいるあいだに meta が変わっていてもよいように）。 */
    var s = scan();
    if (!s.meta) { st.code = 'META_UNREADABLE'; return; }
    var drop = {}, ids = [];
    for (var i = 0; i < s.ok.length; i++) {
      var id = s.ok[i];
      if (serverIds[id]) { st.skipped[id] = 'server-row'; continue; }
      drop[id] = 1; ids.push(id);
    }
    for (var k in s.skipped) if (has(s.skipped, k)) st.skipped[k] = s.skipped[k];
    if (!ids.length) { st.code = 'NOTHING'; return; }
    var next = s.meta.filter(function (e) { return !(e && drop[String(e.id)]); });
    if (!next.length) { st.code = 'WOULD_EMPTY_META'; ids.forEach(function (x) { st.skipped[x] = 'would-empty-meta'; }); return; }
    if (lsg(META) !== s.raw) { st.code = 'META_CHANGED'; return; }   /* 直前に変わっていたら今回は見送る（次に HOME を開いたとき） */
    try { localStorage.setItem(META, JSON.stringify(next)); }
    catch (e) { st.code = 'WRITE_FAILED'; return; }
    st.removed = ids; st.code = 'REMOVED'; st.at = Date.now();
    writeLog(ids);
    try { console.log('[v292DfixGHOST1] 旧スロットの空の行を一覧から外しました: ' + ids.join(',')); } catch (e) {}
    try { var B = window.__v292DhomeDL2; if (B && typeof B.render === 'function') B.render(); } catch (e) {}
  }
  function run() {
    if (off()) { st.off = true; st.phase = 'off'; return; }
    var s0 = scan();
    st.candidates = s0.ok.slice();
    for (var k in s0.skipped) if (has(s0.skipped, k)) st.skipped[k] = s0.skipped[k];
    if (!s0.ok.length) { st.phase = 'done'; st.code = 'NO_CANDIDATE'; return; }   /* 候補が無ければサーバーも読まない */
    st.phase = 'wait-account';
    var tries = 0, listTries = 0;
    (function waitReady() {
      if (off()) { st.off = true; st.phase = 'off'; return; }
      var A = null; try { A = window.__v292Dfix893; } catch (e) { A = null; }
      var W = null; try { W = window.__v292Dfix697; } catch (e) { W = null; }
      if (A && A.active && W && typeof W.listShadowBasisOnce === 'function') {
        st.phase = 'listing';
        listBasis(function (rows, err) {
          if (!rows) {
            st.code = 'LIST_' + String(err || 'FAIL').slice(0, 40);
            /* ★起動直後は /auth/me の答えより先に読むと NOT_LOGGED_IN になる（WebKit で実測）。読むだけなので、間を空けて数回だけ読み直す。
               それでも読めなければ何もしない（今日と同じ）。 */
            if (++listTries < 8) { st.phase = 'wait-account'; setTimeout(waitReady, 1500); return; }
            st.phase = 'done'; return;
          }
          var ids = {}; for (var i = 0; i < rows.length; i++) if (rows[i] && rows[i].id != null) ids[String(rows[i].id)] = 1;
          if (off()) { st.off = true; st.phase = 'off'; return; }
          apply(ids); st.phase = 'done';
        });
        return;
      }
      if (++tries > 60) { st.phase = 'done'; st.code = 'NO_ACCOUNT_LANE'; return; }   /* 30 秒待っても使えない = 何もしない */
      setTimeout(waitReady, 500);
    })();
  }
  window.__v292DfixGHOST1 = {
    status: function () { return JSON.parse(JSON.stringify(st)); },
    log: function () { return J(lsg(LOG), []); },
    _scan: function () { var s = scan(); return { ok: s.ok, skipped: s.skipped }; }
  };
  try {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
    else setTimeout(run, 0);
  } catch (e) {}
})();
