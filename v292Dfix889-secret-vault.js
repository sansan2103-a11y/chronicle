/* v292Dfix889-secret-vault.js — SECRET_STORY_VAULT client **v4**
 * =====================================================================================
 * 権威: /tmp/rr/gpt_ruling_SNAPSHOT_SP17.md（#SP17_VAULT_CLIENT の差戻し 8 件） /
 *       gpt_ruling_SECRET_STORY_VAULT.md（両節） / gpt_ruling_LANE18.md /
 *       #C2_LEGACY_IMAGE（REVISED_GO: backfill は **owner 不明の絵だけ**） /
 *       secret_story_vault_worker_v46_notes.md §8 client item 10〜15。
 * 対になる worker: v46.2-vault-images（`M/release/storypass_w11/worker.js`、`owned` 無し）
 *                  および v46.4-vault-images（`M/candidate/storypass_worker/v18/worker.js`、`owned` 有り）。
 *                  ★v4 は **どちらでも動く**。worker を先に上げる必要も、同時に上げる必要も無い。
 *
 * ★v3 との違いは 2 点だけ（どちらも「見分け」の精度と観測。送信の作法は 1 バイトも変えていない）:
 *   (1) `imgmanifest` の各行が `owned` を持つとき（worker v46.4 = W12-1）、**その値だけで**
 *       印の有無を決める。`owned === 1` ⇒ 印あり（送り直さない）／それ以外 ⇒ orphan（送り直す）。
 *       これで `ORPHAN_DETECTION_NOTE.md` §6.1 の false-negative が閉じる:
 *       `handleImg` の lazy `pkg.idb` 展開で **印の無い key が active ns の一覧に現れてしまう**
 *       場合でも、`owned: 0` を見て正しく orphan と判定し、送り直す。
 *       ★判定は **厳密に `=== 1`**。`'1'`（文字列）・`true`・その他の truthy は **印ありにしない**。
 *         理由: 想定外の型が来たということは worker 側の経路が想定外であり、そこで「印あり」に
 *         倒すと絵が暗いまま残る（復旧は unhide → hide のやり直しが要る）。「印なし」に倒せば
 *         同じ絵をもう一度送るだけで、内容が同じ putimg は worker v28 以降 noop
 *         （rev も byte も動かない）＝ **安全側は送り直す側**である。
 *       ★行が `owned` を **持たない**とき（w11 級の worker）は v3 の判定のまま:
 *         一覧に在る ⇒ 印あり。旧 worker に対する挙動は変わらない。
 *   (2) arm されていない deploy（`CHR_VAULT_ARMED` 未設定）の hide に 503
 *       `VAULT_MEMBERSHIP_DISABLED` が返るとき（worker v46.4 では env gate、w18:4294-4305）、
 *       **数えるだけ**にする（`stats.notArmed`）。画面の出し方・再試行しないこと・backfill を
 *       始めないことは **v2/v3 と同一**（v2 の時点で正しく扱えていた。下の hideStory を参照）。
 *
 * ★v2（sp18 に frozen）との違いは D-C5 の 1 点だけ:
 *   v2 は隠した物語の絵を **手元にある分だけ全部**送り直していた。v46.2 の worker は hide の
 *   ときに server 側で selective move（owner を証明できた絵だけを新しい置き場へ移す）を行うので、
 *   送り直しが要るのは **owner の分からない絵だけ**になった。v3 はそれを見分けてから送る。
 *   見分け方と根拠は `candidate/vault/v3/ORPHAN_DETECTION_NOTE.md`。
 *
 * ★v1（sp17）との違いは 8 つ。全て GPT が BLOCKING と裁定したもの:
 *   D-C1 認証が無い端末では「この端末だけのものだと **証明できる** 物語」しか描かない。
 *        クラウドに結び付いた物語・素性の分からない物語は、server の返事が来るまで描かない。
 *   D-C2 通信できないときは、クラウドの物語の一覧を **開かない**（題名も件数も出さない）。
 *        代わりに「オフラインのため、クラウドの物語を確認できません」とだけ出す。
 *        この端末だけの物語はそのまま出す。★一度クラウドへ上げた物語を、通信が切れただけで
 *        「この端末だけの物語」へ **格下げしない**（判定材料は増える一方で、減らない）。
 *   D-C8 一覧は 2 種類に分かれる: クラウドの物語 と この端末だけの物語（「この端末のみ」）。
 *   D-C3 直 URL の 10 分の近道を **廃止**。クラウドに結び付いた物語は、server の返事より前に
 *        この端末の本文を 1 バイトも読まない。
 *   D-C4 絵の送信に、その絵が属する物語の印を **必ず**添える。
 *   D-C5 隠すときに、その物語の絵のうち **印の付いていないものだけ**をもう一度送り直す
 *        （過去の絵の取り残し対策。v3 で「全部」から「印の無い分だけ」へ narrow し、
 *          v4 で見分けを `owned` に基づく正確なものにした）。
 *   D-C6 混み合って断られたとき（429）や大きすぎたとき（413）に、書きかけを **捨てない**。
 *   D-C7 パスコードの変更（いまのパスコードの再入力つき）と、全ての端末での再ロック。
 *
 * ★kill（v292Dfix889Off='1'）は **UI だけ**を止める。絞り込みと扉は止まらない。
 *   「秘匿の kill は fail-closed」（裁定 修正必須(4)）。
 *
 * 新しい localStorage key は **1 本だけ**: `chr6_vault_hidden`（id の一覧だけ）。
 * session token は sessionStorage `chr6_vaultsess`。
 *
 * 観測: window.__v292Dfix889.status()
 * ===================================================================================== */
(function () {
  'use strict';
  if (window.__v292Dfix889 && window.__v292Dfix889.__real) return;

  var TAG = '[v292Dfix889:secret-vault]';
  var LS_CACHE = 'chr6_vault_hidden';     /* localStorage: id の一覧だけ（cache） */
  var SS_SESS = 'chr6_vaultsess';         /* sessionStorage: token の唯一の置き場 */
  var CACHE_MAX = 1000;
  var MASTER_MIN = 6;
  var MASTER_MAX = 128;
  var REQ_MS = 20000;
  var BACKFILL_MAX = 32;                  /* 1 度に送り直す絵の上限（worker の storyIds 上限と同値） */
  var BACKFILL_GAP_MS = 1100;             /* 60 件/分の書込上限に触れないための間隔（**送信だけ**） */
  /* ★v3: 見分けのための読み取りは書込上限の対象外（worker w11:2222-2232 の CHR_WRITE_OPS に
     `imgmanifest` も `getimg` も入っていない）。枠の制約は無いが、隠した直後の回線を
     probe が独占しないように間隔は置く。150ms × 32 枚 = 4.8 秒で最悪ケースが終わる。 */
  var PROBE_GAP_MS = 150;                 /* 見分けの読み取りの間隔（読み取りは上限の対象外） */

  /* ---- server の code → 画面の文（ASCII の code はここにだけ置く） ---- */
  var CODE_MSG = {
    VAULT_MEMBERSHIP_DISABLED: 'この機能はまだ準備中です',
    VAULT_READONLY: 'この機能はいま一時的に休止しています',
    VAULT_LOCKED_OUT: '入力の回数が多すぎます。しばらく待ってから、もう一度お試しください',
    VAULT_MASTER_INVALID: 'パスコードが違います',
    VAULT_MASTER_REQUIRED: 'いまのパスコードを入力してください',
    VAULT_NOT_SET: 'まだパスコードが設定されていません',
    VAULT_ALREADY_SET: 'パスコードはすでに設定されています',
    VAULT_SESSION_REQUIRED: 'もう一度パスコードを入力してください',
    VAULT_CAS_CONFLICT: '同時に変更されました。もう一度お試しください',
    VAULT_STATE_UNAVAILABLE: 'いま状態を確認できません。少し待ってからお試しください',
    VAULT_SESSION_SECRET_NOT_CONFIGURED: 'この機能はまだ準備中です',
    STORY_NOT_ELIGIBLE: 'この物語はまだクラウドと同期されていません。先に「☁ いま上げる」を行ってください',
    STORY_UNAVAILABLE: 'この物語はいま開けません',
    WRITE_RATE_LIMITED: '少し混み合っています。しばらく待ってから、もう一度お試しください',
    BODY_TOO_LARGE: '内容が大きすぎるため送れませんでした'
  };
  var MSG_NETWORK = '通信を確かめて、もう一度お試しください';
  var MSG_CHECKING = 'クラウドの物語を確認しています…';
  var MSG_OFFLINE_CANON = 'オフラインのため、クラウドの物語を確認できません';
  var MSG_NOAUTH_CANON = 'ログインすると、クラウドの物語も表示します';
  var MSG_UNCONFIRMED = '同期を確認できませんでした。通信を確かめて、もう一度お試しください';
  var MSG_FORGET = 'このパスコードを忘れると秘密の物語を開けなくなります。物語自体は削除されません。';
  var MSG_MIN = 'パスコードは 6 文字以上で入力してください';
  var MSG_LOCAL_ONLY = 'この端末のみ';
  var MSG_KEEP = '書きかけの内容はこの端末に残しています。消えていません。';

  function msgOf(code, fallback) {
    var k = String(code || '');
    if (Object.prototype.hasOwnProperty.call(CODE_MSG, k)) return CODE_MSG[k];
    return fallback || MSG_NETWORK;
  }
  /* 「約 N 分後に」の N。0 分にはしない（「すぐに押せる」と誤解させないため） */
  function waitText(ms) {
    var n = Math.ceil((+ms || 0) / 60000);
    if (!(n > 0)) n = 1;
    if (n > 60) n = 60;
    return '約 ' + n + ' 分後に、もう一度お試しください';
  }

  /* ================================================================= storage ==== */
  function lsg(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lss(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function uiOff() { return lsg('v292Dfix889Off') === '1'; }   /* ★UI だけ止まる */

  function ssGet(k) { try { return (window.sessionStorage && window.sessionStorage.getItem(k)) || ''; } catch (e) { return ''; } }
  function ssSet(k, v) { try { window.sessionStorage.setItem(k, String(v)); return true; } catch (e) { return false; } }
  function ssDel(k) { try { window.sessionStorage.removeItem(k); return true; } catch (e) { return false; } }

  function session() { return ssGet(SS_SESS); }
  function setSession(t) { if (t) { ssSet(SS_SESS, t); VIS.at = 0; } }
  function relock() { ssDel(SS_SESS); VIS.open = false; VIS.at = 0; VIS.state = 'unknown'; dropImgUrls(); }

  /* ---- id だけの cache（authority ではない） ---- */
  function readCache() {
    var o = null;
    try { o = JSON.parse(lsg(LS_CACHE) || 'null'); } catch (e) { o = null; }
    if (!o || typeof o !== 'object') return { at: 0, hidden: {}, visible: {} };
    var out = { at: (typeof o.at === 'number') ? o.at : 0, hidden: {}, visible: {} };
    var a = (Object.prototype.toString.call(o.hidden) === '[object Array]') ? o.hidden : [];
    var b = (Object.prototype.toString.call(o.visible) === '[object Array]') ? o.visible : [];
    var i;
    for (i = 0; i < a.length && i < CACHE_MAX; i++) if (a[i] != null) out.hidden[String(a[i])] = true;
    for (i = 0; i < b.length && i < CACHE_MAX; i++) if (b[i] != null) out.visible[String(b[i])] = true;
    return out;
  }
  function writeCache(hiddenMap, visibleMap) {
    var h = [], v = [], k;
    for (k in hiddenMap) if (Object.prototype.hasOwnProperty.call(hiddenMap, k) && h.length < CACHE_MAX) h.push(k);
    for (k in visibleMap) if (Object.prototype.hasOwnProperty.call(visibleMap, k) && v.length < CACHE_MAX) v.push(k);
    lss(LS_CACHE, JSON.stringify({ v: 1, at: Date.now(), hidden: h, visible: v }));
  }

  /* =========================================== 「この端末だけ」の証明（D-C1 / D-C8） ====
   * 裁定: 「credential 無しでも **明確に local-only と証明できる** Story だけ表示可。
   *        canonical/cloud に結び付いた Story や authority 不明 Story は
   *        server visibility 確認まで描画しない」。
   *
   * ★証明の定義（この 5 本すべてが「クラウドの痕跡ゼロ」を示したときだけ true）:
   *   P1  `v292Dfix402_storyRevs`（fix697 が durable に持つ storyId → server rev の台帳）に
   *       この id の entry が **無い**。1 度でも server rev を受け取っていれば entry が立つ。
   *   P2  `v292Dfix402_f781g_<id>`（fix781 の未同期 marker）が **無い**、または
   *       `lastConfirmed` も `inFlightSave` も null で、state が DIVERGED / BOOTSTRAP_HOLD でない。
   *       lastConfirmed は putcanonical の ACK でだけ立つ ＝ 立っていれば canonical 化済み。
   *   P3  一覧行が cloud 由来でない（`x.cloud !== true`。cloud 行は定義上クラウドの物語）。
   *   P4  `chr6_slots_meta` のこの id の行に、クラウド由来の欄が **1 つも無い**
   *       （serverHash / cloudRev / authority / canonical / rev / syncedAt）。
   *   P5  `chr6_slot_<id>` 本文にも同じ欄が無い。本文が壊れていて読めない場合は **不成立**。
   *
   * ★false-negative の方向（明示）: 迷ったら **隠す**。
   *   - どれか 1 本でも例外を投げたら false。
   *   - JSON が壊れていたら false。
   *   - 台帳に古い entry が残っているだけの「本当は端末だけの物語」も false になる
   *     （＝ 認証が無いあいだ表示されない）。これは **可用性を犠牲にして秘匿を採る**選択であり、
   *     裁定の「hide when unsure」に合わせてある。
   * ★逆向きには決して動かない: この述語は「クラウドの痕跡が 1 つも無い」ことしか true にしない。
   *   一度 canonical 化された物語は P1/P2 の痕跡が消えないので、通信が切れても
   *   「この端末だけの物語」へ格下げされない（裁定 D-C2 後段）。
   * ================================================================================= */
  var CLOUD_FIELDS = ['serverHash', 'cloudRev', 'authority', 'canonicalRev', 'syncedAt', 'rev'];
  var REVS_KEY = 'v292Dfix402_storyRevs';
  var F781_PRE = 'v292Dfix402_f781g_';

  function hasCloudField(o) {
    if (!o || typeof o !== 'object') return false;
    for (var i = 0; i < CLOUD_FIELDS.length; i++) {
      var f = CLOUD_FIELDS[i];
      if (Object.prototype.hasOwnProperty.call(o, f) && o[f] != null && o[f] !== '') return true;
    }
    return !!(o.cloud === true);
  }
  function metaRow(id) {
    var m = null;
    try { m = JSON.parse(lsg('chr6_slots_meta') || '[]'); } catch (e) { return undefined; }
    if (Object.prototype.toString.call(m) !== '[object Array]') return undefined;
    for (var i = 0; i < m.length; i++) if (m[i] && String(m[i].id) === String(id)) return m[i];
    return null;                                   /* 行が無い（undefined = 読めなかった） */
  }
  function provenLocalOnly(id) {
    var s = String(id == null ? '' : id);
    if (!s) return false;
    try {
      /* P1 */
      var revs = null;
      var raw = lsg(REVS_KEY);
      if (raw != null) {
        try { revs = JSON.parse(raw); } catch (e) { return false; }     /* 壊れていたら不成立 */
        if (!revs || typeof revs !== 'object') return false;
        if (Object.prototype.hasOwnProperty.call(revs, s)) return false;
      }
      /* P2 */
      var mraw = lsg(F781_PRE + s);
      if (mraw != null) {
        var mk = null;
        try { mk = JSON.parse(mraw); } catch (e) { return false; }
        if (!mk || typeof mk !== 'object') return false;
        if (mk.lastConfirmed != null || mk.inFlightSave != null) return false;
        if (mk.state === 'DIVERGED' || mk.state === 'BOOTSTRAP_HOLD') return false;
      }
      /* P4 */
      var row = metaRow(s);
      if (row === undefined) return false;                              /* meta が読めない */
      if (row && hasCloudField(row)) return false;
      /* P5 */
      var bodyRaw = lsg(bodyKeyOf(s));
      if (bodyRaw != null) {
        var b = null;
        try { b = JSON.parse(bodyRaw); } catch (e) { return false; }
        if (b && typeof b === 'object' && hasCloudField(b)) return false;
      }
      /* P3 は呼び出し側（一覧行の x.cloud）で判定する。行そのものを渡せる口も出す。 */
      return true;
    } catch (e) { return false; }
  }
  /* 一覧行から判定する入口（P3 を含む）。HOME はこちらを使う。 */
  function rowIsLocalOnly(x) {
    if (!x || x.id == null) return false;
    if (x.cloud === true) return false;                                  /* P3 */
    return provenLocalOnly(x.id);
  }

  /* ================================================================= transport == */
  function proxyUrl() {
    var u = '';
    try { u = (lsg('v292ProxyUrl') || '').trim(); } catch (e) { u = ''; }
    if (u) return u.replace(/\/+$/, '');
    try { if (window.__v292Dfix247bapi && window.__v292Dfix247bapi.DEFAULT_PROXY_URL) return window.__v292Dfix247bapi.DEFAULT_PROXY_URL; } catch (e) {}
    return 'https://novel-proxy.sansan2103.workers.dev';
  }
  /* ★identity header は既存の作法どおり（home.html / fix400 と同じ 2 本）。新 header 0。 */
  function authHeaders() {
    var h = { 'Content-Type': 'application/json' };
    try { var p = (lsg('v292ProxyPass') || '').trim(); if (p) h['x-chronicle-pass'] = p; } catch (e) {}
    try { var g = (window.__chronicleGoogleId && window.__chronicleGoogleId()) || ''; if (g) h['x-google-id'] = g; } catch (e) {}
    if (!h['x-google-id']) {
      try {
        var t = JSON.parse(lsg('v292GoogleToken') || 'null');
        if (t && t.token && (!t.exp || (t.exp * 1000) > (Date.now() + 30000))) h['x-google-id'] = t.token;
      } catch (e) {}
    }
    return h;
  }
  function loggedIn() { var h = authHeaders(); return !!(h['x-google-id'] || h['x-chronicle-pass']); }

  /* ★★匿名 request には vaultSession を **絶対に**載せない。 */
  function withVault(body) {
    var b = body || {};
    if (!loggedIn()) return b;
    var t = session();
    if (t) b.vaultSession = t;
    return b;
  }

  var stats = { list: 0, unlock: 0, unlockFail: 0, hide: 0, unhide: 0, setMaster: 0, rotate: 0,
                getimg: 0, gateShown: 0, net: 0, reloads: 0, tagged: 0, backfill: 0,
                backfillOk: 0, backfillFail: 0, limited: 0, tooLarge: 0, revoked: 0,
                /* ★v3: 見分けの観測。probe = 見分けのために送った読み取りの回数、
                   probeOrphan / probeOwned = 見分けがついた絵の数、
                   storyRequired = 400 IMAGE_STORY_REQUIRED を受けた回数（本来 0）。 */
                probe: 0, probeOrphan: 0, probeOwned: 0, storyRequired: 0,
                /* ★v4: probeOwnedFlag = worker の `owned` を見て判定した絵の数
                   （`owned === 1` も `owned === 0` も両方ここに数える ＝ 「一覧に在る／無い」
                     ではなく **印そのもの**で決められた回数）。0 のままなら相手は w11 級。
                   notArmed = hide が 503 VAULT_MEMBERSHIP_DISABLED を受けた回数
                     （= この deploy では membership がまだ arm されていない）。 */
                probeOwnedFlag: 0, notArmed: 0 };

  var LIMIT = { at: 0, retryAfterMs: 0, code: null, keepLocal: false, count: 0 };

  /* ★D-C6: 429 / 413 を受けたら「捨てない」。ここは **記録と告知だけ**を行い、
     呼び出し元の書きかけには指 1 本触れない。誰かの dirty state を消す道をこの file に作らない。 */
  function noteWriteRefusal(j, status) {
    var code = (j && typeof j.errorCode === 'string') ? j.errorCode : '';
    if (status !== 429 && status !== 413) return false;
    if (code !== 'WRITE_RATE_LIMITED' && code !== 'BODY_TOO_LARGE') return false;
    LIMIT.at = Date.now();
    LIMIT.code = code;
    LIMIT.retryAfterMs = (typeof (j && j.retryAfterMs) === 'number') ? j.retryAfterMs : 0;
    LIMIT.keepLocal = (j && j.keepLocal === true);
    LIMIT.count++;
    if (code === 'WRITE_RATE_LIMITED') stats.limited++; else stats.tooLarge++;
    return true;
  }
  function limitText() {
    if (LIMIT.code === 'BODY_TOO_LARGE') return CODE_MSG.BODY_TOO_LARGE + '。' + MSG_KEEP;
    return '少し混み合っています。' + waitText(LIMIT.retryAfterMs) + '。' + MSG_KEEP;
  }

  function post(body, cb) {
    if (!loggedIn()) { cb(null, 'NOT_LOGGED_IN'); return; }
    var ctrl = null, timer = null;
    try { if (typeof AbortController !== 'undefined') ctrl = new AbortController(); } catch (e) { ctrl = null; }
    if (ctrl) timer = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, REQ_MS);
    var o = { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) };
    if (ctrl) o.signal = ctrl.signal;
    stats.net++;
    try {
      NATIVE_FETCH.call(window, proxyUrl() + '/save', o).then(function (r) {
        if (timer) clearTimeout(timer);
        return r.json().then(function (j) { noteWriteRefusal(j, r.status); cb({ status: r.status, j: j || {} }, null); },
                             function () { cb({ status: r.status, j: {} }, null); });
      })['catch'](function () { if (timer) clearTimeout(timer); cb(null, 'NETWORK'); });
    } catch (e) { if (timer) clearTimeout(timer); cb(null, 'NETWORK'); }
  }
  function codeOf(r) { return (r && r.j && typeof r.j.errorCode === 'string') ? r.j.errorCode : ''; }
  function okOf(r) { return !!(r && r.status === 200 && r.j && r.j.ok === true); }
  function refusedWrite(r) { return !!(r && (r.status === 429 || r.status === 413) &&
    (codeOf(r) === 'WRITE_RATE_LIMITED' || codeOf(r) === 'BODY_TOO_LARGE')); }

  /* ============================================ D-C4: putimg に物語の印を付ける ====
   * 絵を送る口（op:'putimg'）は この file の外に 6 か所ある:
   *   v292Dfix402-invisible-sync.js:1068 / v292Dfix519-icon-p2p.js:73 /
   *   v292Dfix474-candidate.js:149 / v292Dfix523-icon-sync-versioned.js:137 /
   *   v292Dfix634-aiappearance-sync.js:210 と :239
   * 6 か所を個別に書き換えると、1 か所でも漏らした瞬間に帰属が欠ける。そこで
   * **送信の 1 点**（window.fetch）で印を付ける。fix889 は index.html の <head> の
   * 先頭近くで評価されるので、上の 6 本が module 読み込み時に掴む `fetch` は
   * **すでにこの wrapper** である（X-13 が読み込み順を実測する）。
   *
   * ★印にする値 = いまこの document が開いている物語の id（`chr6_active_slot`）。
   *   絵はその物語を遊んでいる最中に作られるので、これが素直な帰属である。
   * ★worker は同一 mid の再送を replay で返す（image_owner の行が立たない）。
   *   そこで印を足したときは mid にも同じ印を足して、
   *   「同じ絵・同じ物語」だけが replay されるようにする。
   * ★`storyId` が取れないときは **何もしない**（誤った帰属を書かない方が安全）。 */
  var NATIVE_FETCH = (typeof window.fetch === 'function') ? window.fetch : null;
  var fetchWrapped = false;

  function activeStoryId() {
    var s = '';
    try { s = String(lsg('chr6_active_slot') || '').replace(/^"|"$/g, ''); } catch (e) { s = ''; }
    if (!s) { try { s = String(storyIdOfUrl() || ''); } catch (e) { s = ''; } }
    if (s === 'chr6') s = 'default';        /* 内部 slot の id は一覧側では 'default' */
    return s;
  }
  function tagPutimgBody(text) {
    var o = null;
    try { o = JSON.parse(text); } catch (e) { return null; }
    if (!o || typeof o !== 'object' || o.op !== 'putimg') return null;
    if (o.storyId != null && o.storyId !== '') return null;              /* 既に付いている */
    if (Object.prototype.toString.call(o.storyIds) === '[object Array]' && o.storyIds.length) return null;
    var sid = activeStoryId();
    if (!sid) return null;
    o.storyId = sid;
    if (o.mid != null && o.mid !== '') o.mid = String(o.mid) + '|s' + sid;
    stats.tagged++;
    try { return JSON.stringify(o); } catch (e) { return null; }
  }
  function wrapFetch() {
    if (fetchWrapped || !NATIVE_FETCH) return false;
    var w = function (input, init) {
      try {
        var u = (typeof input === 'string') ? input : (input && input.url) || '';
        if (init && typeof init.body === 'string' && String(u).indexOf('/save') >= 0) {
          var t = tagPutimgBody(init.body);
          if (t != null) {
            var i2 = {}, k;
            for (k in init) if (Object.prototype.hasOwnProperty.call(init, k)) i2[k] = init[k];
            i2.body = t;
            init = i2;
          }
        }
      } catch (e) {}
      return NATIVE_FETCH.call(this === w ? window : this, input, init);
    };
    w.__f889 = true;
    try { window.fetch = w; } catch (e) { return false; }
    fetchWrapped = true;
    return true;
  }

  /* ================================================================ visibility == */
  /* state:
       'unknown' … この document ではまだ server に聞けていない
       'ready'   … server の可視集合を取れた
       'cache'   … 届かないが cache がある
       'noauth'  … 認証が 1 つも無い
       'blind'   … 届かず cache も無い
     ★v2 では state が何であれ「この端末だけと証明できる物語」は描ける。
       描けないのは **クラウドに結び付いた物語 / 素性不明の物語** だけである。 */
  var VIS = { state: 'unknown', visible: {}, hidden: {}, open: false, at: 0, inflight: false, code: null, tried: false };
  (function () { try { var c0 = readCache(); VIS.hidden = c0.hidden; VIS.visible = c0.visible; } catch (e) {} })();
  var listeners = [];
  function onChange(fn) { if (typeof fn === 'function') listeners.push(fn); }
  function fire() { for (var i = 0; i < listeners.length; i++) { try { listeners[i](); } catch (e) {} } }

  function idsOf(j) {
    var out = {}, rows = (j && j.stories) || [];
    if (Object.prototype.toString.call(rows) !== '[object Array]') return out;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r && r.id != null && String(r.id) !== '') out[String(r.id)] = true;
    }
    return out;
  }

  function settleOffline(code) {
    var c = readCache();
    VIS.code = code;
    if (!loggedIn()) VIS.state = 'noauth';
    else if (c.at) VIS.state = 'cache';
    else VIS.state = 'blind';
    /* ★hidden は cache から復元する（「隠してある」という情報は失わない）。
       visible は **捨てる**: server に確認できていない以上「見てよい」と言えないため。
       ★これは格下げではない。canonical な物語は描かれないだけで、
         local-only へ分類し直されることは無い（provenLocalOnly が痕跡を見ている）。 */
    VIS.hidden = c.hidden;
    VIS.visible = {};
    VIS.open = false;
    VIS.inflight = false;
    fire();
  }

  function refresh(cb) {
    if (VIS.inflight) { if (cb) onChange(cb); return; }
    if (VIS.state === 'ready' && VIS.at && (Date.now() - VIS.at) < 3000) { if (cb) cb(); return; }
    VIS.tried = true;
    if (!loggedIn()) { settleOffline('NOT_LOGGED_IN'); if (cb) cb(); return; }
    VIS.inflight = true;
    stats.list++;
    post({ op: 'listshadow' }, function (r, err) {
      if (err || !okOf(r)) { settleOffline(err || codeOf(r) || 'BAD_RESPONSE'); if (cb) cb(); return; }
      var vis = idsOf(r.j);
      var tok = session();
      if (!tok) {
        var c = readCache(), h = {}, k;
        for (k in c.hidden) if (Object.prototype.hasOwnProperty.call(c.hidden, k)) h[k] = true;
        for (k in c.visible) if (Object.prototype.hasOwnProperty.call(c.visible, k) && !vis[k]) h[k] = true;
        for (k in vis) if (Object.prototype.hasOwnProperty.call(vis, k)) delete h[k];
        VIS.visible = vis; VIS.hidden = h; VIS.open = false; VIS.state = 'ready';
        VIS.at = Date.now(); VIS.inflight = false; VIS.code = 'OK';
        writeCache(h, vis);
        fire(); if (cb) cb(); return;
      }
      stats.list++;
      post(withVault({ op: 'listshadow' }), function (r2, err2) {
        var all = (!err2 && okOf(r2)) ? idsOf(r2.j) : null;
        var h2 = {}, k2;
        if (all) {
          for (k2 in all) if (Object.prototype.hasOwnProperty.call(all, k2) && !vis[k2]) h2[k2] = true;
          VIS.open = true;
        } else {
          var c2 = readCache();
          for (k2 in c2.hidden) if (Object.prototype.hasOwnProperty.call(c2.hidden, k2) && !vis[k2]) h2[k2] = true;
          VIS.open = false;
        }
        VIS.visible = vis; VIS.hidden = h2; VIS.state = 'ready';
        VIS.at = Date.now(); VIS.inflight = false; VIS.code = 'OK';
        writeCache(h2, vis);
        fire(); if (cb) cb();
      });
    });
  }

  /* ---- 2 つの分類（D-C8） ---- */
  function classOfRow(x) { return rowIsLocalOnly(x) ? 'local' : 'canonical'; }
  function classOf(id) { return provenLocalOnly(id) ? 'local' : 'canonical'; }

  /* server の返事が要るのはどちらか（＝ クラウドの一覧を開いてよい状態か） */
  function canonSettled() { return VIS.state === 'ready'; }
  function canonState() {
    if (VIS.state === 'ready') return 'ready';
    if (VIS.state === 'noauth') return 'noauth';
    if (VIS.state === 'cache' || VIS.state === 'blind') return 'offline';
    return 'checking';
  }
  function canonNotice() {
    var s = canonState();
    if (s === 'ready') return '';
    if (s === 'noauth') return MSG_NOAUTH_CANON;
    if (s === 'offline') return MSG_OFFLINE_CANON;
    return MSG_CHECKING;
  }

  /* この行をいま描いてよいか。★「分からない」は描かない側へ倒す。 */
  function mayShowRow(x) {
    if (!x || x.id == null) return false;
    var s = String(x.id);
    if (VIS.hidden[s]) return false;                       /* 隠してあると分かっているものは常に不可 */
    if (classOfRow(x) === 'local') return true;            /* この端末だけと証明できる */
    return VIS.state === 'ready' && !!VIS.visible[s];      /* クラウド側は server の返事が要る */
  }
  function mayShow(id) {
    var s = String(id == null ? '' : id);
    if (!s) return false;
    if (VIS.hidden[s]) return false;
    if (classOf(s) === 'local') return true;
    return VIS.state === 'ready' && !!VIS.visible[s];
  }
  function isHidden(id) { return !!VIS.hidden[String(id == null ? '' : id)]; }
  /* v2: 一覧は常に描いてよい（クラウド側だけが待たされる）。配布事故時の互換のため残す。 */
  function listReady() { return true; }
  function listBlind() { return VIS.state === 'blind'; }

  /* ===================================================================== dialog = */
  var STY = 'v889style', DLG = 'v889dialog';
  function ensureStyle() {
    if (document.getElementById(STY)) return;
    var st = document.createElement('style'); st.id = STY;
    st.textContent =
      '#' + DLG + '{position:fixed;inset:0;z-index:100001;display:flex;align-items:center;justify-content:center;' +
      'background:rgba(0,0,0,.72);padding:16px;box-sizing:border-box}' +
      '#' + DLG + ' .v889card{background:#1b1b20;color:#f2f2f4;border:1px solid #3a3a44;border-radius:12px;width:100%;' +
      'max-width:420px;padding:20px;box-sizing:border-box;font-size:15px;line-height:1.7;max-height:calc(100vh - 32px);overflow:auto}' +
      '#' + DLG + ' h2{margin:0 0 10px;font-size:17px;line-height:1.5}' +
      '#' + DLG + ' p{margin:0 0 12px;font-size:13.5px;color:#c8c8d0}' +
      '#' + DLG + ' .v889warn{color:#ffcf7a;background:#2a2318;border:1px solid #574524;border-radius:8px;padding:10px 12px;font-size:13px;margin:0 0 12px}' +
      '#' + DLG + ' .v889err{color:#ff9d9d;font-size:13px;margin:0 0 10px;min-height:1.2em}' +
      '#' + DLG + ' input{width:100%;box-sizing:border-box;font-size:16px;padding:11px 12px;border-radius:8px;' +
      'border:1px solid #4a4a56;background:#111114;color:#fff;margin:0 0 10px}' +
      '#' + DLG + ' .v889row{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}' +
      '#' + DLG + ' button{flex:1 1 auto;min-width:120px;min-height:44px;font-size:15px;border-radius:8px;' +
      'border:1px solid #4a4a56;background:#2c2c34;color:#f2f2f4;cursor:pointer;padding:0 14px}' +
      '#' + DLG + ' button.v889go{background:#3a5bd9;border-color:#3a5bd9}' +
      '.v889sec{margin:18px 0 0;padding:14px 0 0;border-top:1px solid rgba(255,255,255,.12)}' +
      '.v889note{font-size:12px;opacity:.75;line-height:1.7;padding:8px 2px}' +
      '.v889only{font-size:11px;opacity:.85;border:1px solid rgba(255,255,255,.28);border-radius:999px;' +
      'padding:1px 8px;margin-left:6px;white-space:nowrap;display:inline-block}';
    (document.head || document.documentElement).appendChild(st);
  }
  function closeDialog() { var d = document.getElementById(DLG); if (d && d.parentNode) d.parentNode.removeChild(d); }
  function dialog() {
    ensureStyle();
    closeDialog();
    var ov = document.createElement('div'); ov.id = DLG;
    var card = document.createElement('div'); card.className = 'v889card';
    ov.appendChild(card);
    (document.body || document.documentElement).appendChild(ov);
    return card;
  }
  function mk(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = String(text);
    return e;
  }
  function pwInput(ph) {
    var i = document.createElement('input');
    i.type = 'password'; i.autocomplete = 'off'; i.setAttribute('placeholder', String(ph));
    return i;
  }

  /* ---- master パスコードの設定（隠す前の 1 段目） ---- */
  function askSetMaster(done) {
    var card = dialog();
    card.appendChild(mk('h2', null, '秘密の物語用パスコードを設定'));
    card.appendChild(mk('p', null, '秘密の物語を開くときに使うパスコードです。6 文字以上で決めてください。'));
    card.appendChild(mk('div', 'v889warn', MSG_FORGET));
    var i1 = pwInput('パスコード'), i2 = pwInput('もう一度入力');
    card.appendChild(i1); card.appendChild(i2);
    var err = mk('div', 'v889err', ''); card.appendChild(err);
    var row = mk('div', 'v889row');
    var no = mk('button', null, 'やめる'), go = mk('button', 'v889go', '設定する');
    row.appendChild(no); row.appendChild(go); card.appendChild(row);
    no.addEventListener('click', function () { closeDialog(); if (done) done(false); }, false);
    go.addEventListener('click', function () {
      var a = String(i1.value || ''), b = String(i2.value || '');
      if (a.length < MASTER_MIN || a.length > MASTER_MAX) { err.textContent = MSG_MIN; return; }
      if (a !== b) { err.textContent = '2 つの入力が一致しません'; return; }
      go.disabled = true; err.textContent = '';
      stats.setMaster++;
      post({ op: 'vaultset', master: a }, function (r, e2) {
        go.disabled = false;
        if (refusedWrite(r)) { err.textContent = limitText(); return; }
        if (e2 || !okOf(r)) { err.textContent = e2 ? MSG_NETWORK : msgOf(codeOf(r)); return; }
        post({ op: 'vaultunlock', master: a }, function (r2) {
          if (okOf(r2) && r2.j && r2.j.vaultSession) { setSession(r2.j.vaultSession); stats.unlock++; }
          closeDialog(); if (done) done(true);
        });
      });
    }, false);
    try { i1.focus(); } catch (e) {}
  }

  /* ---- 解錠 ---- */
  function askUnlock(done) {
    var card = dialog();
    card.appendChild(mk('h2', null, '秘密の物語'));
    card.appendChild(mk('p', null, 'パスコードを入力すると、秘密の物語を開けます。'));
    var i1 = pwInput('パスコード');
    card.appendChild(i1);
    var err = mk('div', 'v889err', ''); card.appendChild(err);
    var row = mk('div', 'v889row');
    var no = mk('button', null, '閉じる'), go = mk('button', 'v889go', '開く');
    row.appendChild(no); row.appendChild(go); card.appendChild(row);
    no.addEventListener('click', function () { closeDialog(); if (done) done(false); }, false);
    go.addEventListener('click', function () {
      var a = String(i1.value || '');
      if (a.length < MASTER_MIN) { err.textContent = MSG_MIN; return; }
      go.disabled = true; err.textContent = '';
      post({ op: 'vaultunlock', master: a }, function (r, e2) {
        go.disabled = false;
        if (e2) { err.textContent = MSG_NETWORK; return; }
        if (!okOf(r)) {
          stats.unlockFail++;
          if (codeOf(r) === 'VAULT_NOT_SET') { closeDialog(); askSetMaster(done); return; }
          err.textContent = msgOf(codeOf(r));
          return;
        }
        if (r.j && r.j.vaultSession) setSession(r.j.vaultSession);
        stats.unlock++;
        closeDialog();
        if (done) done(true);
      });
    }, false);
    try { i1.focus(); } catch (e) {}
  }

  /* ---- D-C7: パスコードの変更 ＋ 全ての端末で再ロック ----
     worker の `vaultrotate` は「有効な session」に加えて **いまの master の再入力**を必須にする
     （裁定 修正必須(3)）。newMaster を省くと master 据え置きで session だけが切れる
     ＝「全ての端末で再ロック」。どちらも同じ 1 つの口で行う。 */
  function askRotate(done) {
    var card = dialog();
    card.appendChild(mk('h2', null, '秘密の物語のパスコードを変更'));
    card.appendChild(mk('p', null, 'いまのパスコードを入れてから、新しいパスコードを決めてください。変更すると、ほかの端末は開いたままにならず、もう一度パスコードが必要になります。'));
    card.appendChild(mk('div', 'v889warn', MSG_FORGET));
    var cur = pwInput('いまのパスコード');
    var n1 = pwInput('新しいパスコード'), n2 = pwInput('新しいパスコード（もう一度）');
    card.appendChild(cur); card.appendChild(n1); card.appendChild(n2);
    var err = mk('div', 'v889err', ''); card.appendChild(err);
    var row = mk('div', 'v889row');
    var no = mk('button', null, 'やめる');
    var only = mk('button', null, '全ての端末で再ロック');
    var go = mk('button', 'v889go', '変更する');
    row.appendChild(no); row.appendChild(only); row.appendChild(go); card.appendChild(row);
    no.addEventListener('click', function () { closeDialog(); if (done) done(false); }, false);

    function send(newMaster) {
      var c = String(cur.value || '');
      if (c.length < MASTER_MIN) { err.textContent = 'いまのパスコードを入力してください'; return; }
      go.disabled = true; only.disabled = true; err.textContent = '';
      var body = withVault({ op: 'vaultrotate', master: c });
      if (newMaster != null) body.newMaster = newMaster;
      stats.rotate++;
      post(body, function (r, e2) {
        go.disabled = false; only.disabled = false;
        if (refusedWrite(r)) { err.textContent = limitText(); return; }
        if (e2 || !okOf(r)) { err.textContent = e2 ? MSG_NETWORK : msgOf(codeOf(r)); return; }
        /* rotate すると **いま持っている鍵も切れる**。持ったままにしない。 */
        relock(); fire();
        closeDialog();
        toast(newMaster != null ? 'パスコードを変更しました。もう一度開くときは新しいパスコードを使ってください' :
                                  '全ての端末で再ロックしました');
        refresh();
        if (done) done(true);
      });
    }
    only.addEventListener('click', function () { send(null); }, false);
    go.addEventListener('click', function () {
      var a = String(n1.value || ''), b = String(n2.value || '');
      if (a.length < MASTER_MIN || a.length > MASTER_MAX) { err.textContent = MSG_MIN; return; }
      if (a !== b) { err.textContent = '2 つの入力が一致しません'; return; }
      send(a);
    }, false);
    try { cur.focus(); } catch (e) {}
  }

  /* master が設定済みかを見てから解錠 / 設定へ分ける（2 段 UX の入口） */
  function ensureUnlocked(done) {
    if (session()) { done(true); return; }
    post({ op: 'vaultstatus' }, function (r, e) {
      if (e || !okOf(r)) { askUnlock(done); return; }
      if (r.j && r.j.hasMaster === false) { askSetMaster(done); return; }
      askUnlock(done);
    });
  }

  /* ======================================== D-C5: 絵の帰属の埋め直し（backfill） ====
   * worker v46 notes D-1 / D-2: `image_owner` は `putimg` のときにしか埋まらない。
   * 既に server にある絵には行が無く、client にしか key → 物語の対応が無い。
   * worker に新しい口は **無い**ので、client から「同じ絵をもう一度送る」しかない。
   *
   * ★★v3（裁定 #C2_LEGACY_IMAGE = REVISED_GO）: 送り直すのは **印の無い絵だけ**にする。
   *   worker v46.2 は hide のときに server 側で selective move を行う
   *   （w11:4229 `UPDATE images SET ns=new WHERE ns=old AND k IN (SELECT key FROM image_owner WHERE u=?)`）。
   *   ＝ 印のある絵は置き場が移るだけで、client が何もしなくても見えたままになる。
   *   置き去りになるのは **印の無い絵（orphan）だけ**で、送り直しが要るのもそれだけである。
   *   見分け方（詳細と行番号は `candidate/vault/v3/ORPHAN_DETECTION_NOTE.md`）:
   *     第一手 `op:'imgmanifest'` … いま有効な置き場に在る key の一覧を 1 往復で取る
   *                                 （w11:2801-2823。絵の本体は 1 バイトも運ばない）。
   *                                 手元にあって一覧に無い key ＝ orphan。
   *     第二手 `op:'getimg'`     … 第一手が使えないときだけ、key ごとに確かめる
   *                                 （200 = 印あり / 404 = orphan か本体欠落。どちらも送り直しが正解）。
   *     どちらも通らなかった key は **送らない**（判らないものを送りつけない）。
   *
   * ★同じ内容の putimg は worker v28 以降 noop（rev は進まず byte も書き直さない）で、
   *   それでも `image_owner` への INSERT は走る（v14 worker.js:2868-2878 は d1PutImg の
   *   あとに **無条件で**実行される）。＝ 送り直しは冪等であり、絵を壊さない。
   * ★ただし `mid` を付けると replay で早期 return され INSERT まで届かない。
   *   したがって backfill は **mid を付けない**。
   * ★送信は 1 枚ずつ、1.1 秒あけて行う（60 件/分の書込上限に触れないため）。
   * ★429 / 413 を受けたら **やめる**。捨てずに残し、次の機会に再開する。
   * ★上限 32 枚。それ以上ある物語は「全部は送れていない」ことを status() に残す。
   * ★限界（正直に）: ここで送れるのは **この端末の localStorage にある絵だけ**である。
   *   別の端末でしか作っていない絵、既に手元から消えた絵には印が付かない。
   *   その面は worker 側の epoch rotation（配布済み URL の一括失効）が受け持つ。 */
  var backfill = { running: false, queue: [], storyId: null, done: 0, skipped: 0, capped: false,
                   /* ★v3 の見分けの記録 */
                   probing: false, probeMode: null, probed: 0, owned: 0, orphan: 0,
                   probeFail: 0, storyRequired: 0 };

  function avatarKeysOfStory(id) {
    /* 物語の登場人物名 → fix197 の keyFor() → localStorage の絵 key。
       fix197 が載っていない document（home.html）では取れないので、その場合は
       「手元の絵 key を全部」ではなく **0 件**にする（無関係な絵に印を付けない）。 */
    /* ★key で重複を落とす。2 人の登場人物が同じ名前・同じ画風なら絵は 1 枚しか無く、
       同じ key を 2 度送っても server 側の帰属行は ON CONFLICT DO NOTHING で増えない。
       送るだけ 60 件/分の書込枠を無駄にするので、ここで落とす。 */
    var out = [], seen = {}, names = {}, i;
    var f197 = null;
    try { f197 = window.__v292Dfix197 || null; } catch (e) { f197 = null; }
    var keyFor = (f197 && typeof f197.keyFor === 'function') ? f197.keyFor : null;
    var body = null;
    try { body = JSON.parse(lsg(bodyKeyOf(id)) || 'null'); } catch (e) { body = null; }
    if (!body || typeof body !== 'object') return out;
    try {
      if (body.cast) {
        if (body.cast.hero && body.cast.hero.name) names[String(body.cast.hero.name)] = true;
        var ns = body.cast.npcs;
        if (Object.prototype.toString.call(ns) === '[object Array]')
          for (i = 0; i < ns.length; i++) if (ns[i] && ns[i].name) names[String(ns[i].name)] = true;
      }
    } catch (e) {}
    if (!keyFor) return out;
    for (var nm in names) {
      if (!Object.prototype.hasOwnProperty.call(names, nm)) continue;
      var pk = '';
      try { pk = String(keyFor(nm) || ''); } catch (e) { pk = ''; }
      if (!pk) continue;
      var k = keyOf(pk);
      if (seen[k]) continue;
      var v = lsg(k);
      if (typeof v === 'string' && v.indexOf('data:image') === 0 && v.length < 2 * 1024 * 1024) { seen[k] = true; out.push(k); }
    }
    return out;
  }

  /* ---- 見分け 第一手: いま有効な置き場に在る key の一覧（1 往復・本体を運ばない） ----
     ★必ず vaultSession を載せる。載せないと worker は隠した物語の key を一覧から落とすので
       （w11:2816-2821）、印のある絵まで orphan に見えてしまう。

     ★★v4: 1 行ぶんの判定を rowOwned() に切り出した。
       worker v46.4（W12-1, w18:2823-2836）は各行に `owned: 0|1` を載せる:
         `man[k] = { rev, hash, owned: (r.owned ? 1 : 0) }`  ← **必ず number の 0 か 1**
       行が `owned` を **持つ**なら、一覧に在るかどうかではなく **その値だけ**で決める。
       これが `ORPHAN_DETECTION_NOTE.md` §6.1 を閉じる 1 点である:
       `handleImg` の lazy `pkg.idb` 展開（w11:2166-2172）が印の無い key を active ns へ
       書き込んでも、その行は `owned: 0` で来るので v4 は正しく orphan と判定して送り直す。

       ★判定は **厳密に `=== 1`**。`'1'`（文字列）・`true`・`2` などの truthy は印ありにしない。
         worker は必ず number を入れる（w18:2836 の `(r.owned ? 1 : 0)`）ので、別の型が来た時点で
         経路が想定外である。そこで「印あり」に倒すと絵が暗いまま残り、復旧に unhide → hide の
         やり直しが要る。「印なし」に倒せば同じ絵をもう一度送るだけで済み、内容が同じ putimg は
         worker v28 以降 noop（rev も byte も動かない。帰属行の INSERT だけが走る）＝
         **安全側は送り直す側**。fail-open ではなく fail-toward-resend を選ぶ。
       ★行が `owned` を持たないとき（w11 級の worker）は v3 のまま「一覧に在る ⇒ 印あり」。 */
  /* 戻り値: true = 印あり（送り直さない） / false = orphan（送り直す）。
     byFlag に「`owned` で決めたか」を入れて返す（観測用。stats.probeOwnedFlag）。 */
  function rowOwned(man, k, byFlag) {
    if (!Object.prototype.hasOwnProperty.call(man, k)) return false;     /* 一覧に無い ⇒ orphan */
    var row = man[k];
    if (row && typeof row === 'object' && Object.prototype.hasOwnProperty.call(row, 'owned')) {
      byFlag.v = true;
      return row.owned === 1;                                            /* ★厳密。truthy では倒さない */
    }
    return true;                                                         /* `owned` 無し ⇒ v3 の判定 */
  }
  function probeOrphans(keys, cb) {
    backfill.probing = true;
    stats.probe++;
    post(withVault({ op: 'imgmanifest' }), function (r, e) {
      var man = null;
      if (!e && okOf(r) && r.j && r.j.manifest && typeof r.j.manifest === 'object') man = r.j.manifest;
      if (man) {
        var out = [], i, bf;
        for (i = 0; i < keys.length; i++) {
          backfill.probed++;
          bf = { v: false };
          var isOwned = rowOwned(man, keys[i], bf);
          if (bf.v) stats.probeOwnedFlag++;                 /* ★v4: `owned` で決めた分だけ数える */
          if (isOwned) { backfill.owned++; stats.probeOwned++; }
          else { backfill.orphan++; stats.probeOrphan++; out.push(keys[i]); }
        }
        backfill.probing = false;
        backfill.probeMode = 'manifest';
        cb(out);
        return;
      }
      /* 一覧が取れない（古い worker・応答が壊れている・通信失敗）ときだけ 1 枚ずつ確かめる。 */
      backfill.probeMode = 'getimg';
      probeStep(keys, 0, [], cb);
    });
  }
  /* ---- 見分け 第二手: key ごとに読んでみる ----
     200 = 印あり（送り直し不要） / 404 = orphan か本体欠落（どちらも送り直しが正解）。
     ★通信そのものが落ちた key は **判定不能**として送らず、そこで見分けを止める（spin しない）。 */
  function probeStep(keys, i, out, cb) {
    if (i >= keys.length) { backfill.probing = false; cb(out); return; }
    var k = keys[i];
    stats.probe++;
    post(withVault({ op: 'getimg', k: k }), function (r, e) {
      if (e) { backfill.probeFail++; backfill.probing = false; cb(out); return; }
      backfill.probed++;
      if (okOf(r) && r.j && r.j.data) { backfill.owned++; stats.probeOwned++; }
      else { backfill.orphan++; stats.probeOrphan++; out.push(k); }
      setTimeout(function () { probeStep(keys, i + 1, out, cb); }, PROBE_GAP_MS);
    });
  }

  function startBackfill(id) {
    var sid = String(id == null ? '' : id);
    if (!sid || backfill.running) return false;
    var keys = avatarKeysOfStory(sid);
    backfill.capped = keys.length > BACKFILL_MAX;
    var cand = keys.slice(0, BACKFILL_MAX);
    backfill.queue = [];
    backfill.storyId = sid;
    backfill.done = 0; backfill.skipped = 0;
    backfill.probeMode = null; backfill.probed = 0; backfill.owned = 0; backfill.orphan = 0;
    backfill.probeFail = 0; backfill.storyRequired = 0;
    if (!cand.length) return false;
    backfill.running = true;
    stats.backfill++;
    /* ★v3: 見分けてから送る。送るのは orphan だけ。 */
    probeOrphans(cand, function (orphans) {
      backfill.queue = orphans;
      if (!backfill.queue.length) { backfill.running = false; return; }
      step();
    });
    return true;
  }
  function step() {
    if (!backfill.queue.length) { backfill.running = false; return; }
    var k = backfill.queue.shift();
    var v = lsg(k);
    if (typeof v !== 'string' || v.indexOf('data:image') !== 0) { backfill.skipped++; setTimeout(step, 0); return; }
    /* ★mid は付けない（付けると replay で帰属の記録まで届かない） */
    post({ op: 'putimg', k: k, data: v, storyId: backfill.storyId }, function (r, e) {
      if (refusedWrite(r)) {
        /* 捨てない。戻して中断する。 */
        backfill.queue.unshift(k);
        backfill.running = false;
        stats.backfillFail++;
        toast(limitText());
        return;
      }
      /* ★v3: 400 IMAGE_STORY_REQUIRED（w11:2836-2845）。ここでは storyId を必ず付けて送って
         いるので **本来起きない**。起きたら数えるだけにして、この key は **この session では
         二度と送らない**（queue に戻さない ＝ 同じ拒否を繰り返さない）。残りの key は続ける。 */
      if (r && r.status === 400 && codeOf(r) === 'IMAGE_STORY_REQUIRED') {
        backfill.storyRequired++; stats.storyRequired++; stats.backfillFail++;
        setTimeout(step, BACKFILL_GAP_MS);
        return;
      }
      if (e || !okOf(r)) { backfill.skipped++; stats.backfillFail++; }
      else { backfill.done++; stats.backfillOk++; }
      setTimeout(step, BACKFILL_GAP_MS);
    });
  }

  /* ===================================================================== hide === */
  function hideStory(id, done) {
    var sid = String(id == null ? '' : id);
    if (!sid) { if (done) done(false); return; }
    ensureUnlocked(function (ok) {
      if (!ok) { if (done) done(false); return; }
      stats.hide++;
      post(withVault({ op: 'hidestory', id: sid }), function (r, e) {
        if (refusedWrite(r)) { toast(limitText()); if (done) done(false); return; }
        /* ★★v4: arm されていない deploy（`CHR_VAULT_ARMED` 未設定 = worker v46.4 の既定。
           w18:4294-4305 が secret / session / D1 のどれよりも **前**で 503 を返す）。
           ここで足すのは **counter 1 本だけ**である。挙動は v2 の時点から既に正しい:
             ・すぐ下の `e || !okOf(r)` が拾って toast → done(false) で終わる。
             ・再試行の道はこの file のどこにも無い（retry / backoff / setTimeout での再送は 0 箇所）。
             ・`startBackfill(sid)` はこの return より **後ろ**にしかないので走らない ＝ 書込 0。
             ・cache（`chr6_vault_hidden`）も VIS も触らない ＝ 「隠れた」と誤表示しない。
           ★画面に出るのは CODE_MSG の自前の文（'この機能はまだ準備中です'）。この client は
             server の `error` 文字列を **一度も画面に出さない**（v1 からの作法: ASCII の code →
             手元の文）。worker 側の文（'この操作はまだ有効ではありません'）とは文言が違うが、
             どちらも「まだ使えない」を伝える。文言を揃えるかは copy の裁定であり、v4 では変えない。 */
        if (!e && r && r.status === 503 && codeOf(r) === 'VAULT_MEMBERSHIP_DISABLED') stats.notArmed++;
        if (e || !okOf(r)) { toast(e ? MSG_NETWORK : msgOf(codeOf(r))); if (done) done(false); return; }
        VIS.hidden[sid] = true; delete VIS.visible[sid];
        writeCache(VIS.hidden, VIS.visible);
        VIS.at = 0; refresh();
        startBackfill(sid);                     /* ★D-C5: 絵の帰属を埋め直す */
        toast('この物語を隠しました');
        if (done) done(true);
      });
    });
  }
  function unhideStory(id, done) {
    var sid = String(id == null ? '' : id);
    if (!sid) { if (done) done(false); return; }
    ensureUnlocked(function (ok) {
      if (!ok) { if (done) done(false); return; }
      stats.unhide++;
      post(withVault({ op: 'unhidestory', id: sid }), function (r, e) {
        if (refusedWrite(r)) { toast(limitText()); if (done) done(false); return; }
        if (e || !okOf(r)) { toast(e ? MSG_NETWORK : msgOf(codeOf(r))); if (done) done(false); return; }
        delete VIS.hidden[sid]; VIS.visible[sid] = true;
        writeCache(VIS.hidden, VIS.visible);
        VIS.at = 0; refresh();
        toast('この物語を一覧に戻しました');
        if (done) done(true);
      });
    });
  }

  function toast(text) {
    try {
      var d = document.getElementById('v889toast');
      if (!d) {
        d = document.createElement('div'); d.id = 'v889toast';
        d.setAttribute('role', 'status'); d.setAttribute('aria-live', 'polite');
        d.style.cssText = 'position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom));' +
          'transform:translateX(-50%);max-width:92vw;padding:10px 16px;border-radius:10px;' +
          'background:rgba(20,20,24,.92);color:#fff;font-size:14px;line-height:1.6;z-index:100002';
        (document.body || document.documentElement).appendChild(d);
      }
      d.textContent = String(text == null ? '' : text);
      d.style.display = '';
      if (d.__t) { try { clearTimeout(d.__t); } catch (e) {} }
      d.__t = setTimeout(function () { try { d.style.display = 'none'; } catch (e) {} }, 6000);
    } catch (e) {}
  }

  /* ============================================================== direct URL ==== */
  /* ★D-C3: 10 分の近道を廃止した。
     この端末の本文を読ませてよいのは 2 つの場合だけ:
       (a) この端末に本文が無い（漏れるものが無い）
       (b) 「この端末だけの物語」だと **証明できる**（＝ 一度もクラウドへ行っていない。
           worker は canonical でない物語を隠せないので、隠されている可能性が無い）
     それ以外は **必ず**扉を張って server に聞く。認証が無い / 通信できないときは開かない。 */
  var GATE = { armed: false, id: null, key: null, reason: null, released: false, probing: false };

  function storyIdOfUrl() {
    var u = null;
    try { u = new URLSearchParams(location.search).get('story'); } catch (e) { u = null; }
    return u ? String(u) : null;
  }
  function bodyKeyOf(id) { return (id === 'default' || id === 'chr6') ? 'chr6' : ('chr6_slot_' + id); }
  function localBodyExists(id) {
    try { if (lsg(bodyKeyOf(id)) != null) return true; } catch (e) {}
    try {
      var m = JSON.parse(lsg('chr6_slots_meta') || '[]');
      if (Object.prototype.toString.call(m) === '[object Array]') {
        for (var i = 0; i < m.length; i++) if (m[i] && String(m[i].id) === String(id)) return true;
      }
    } catch (e) {}
    return false;
  }

  var trapped = false;
  function armTrap() {
    if (trapped) return;
    trapped = true;
    try {
      var P = window.Storage && window.Storage.prototype;
      if (!P || P.__f889) return;
      var og = P.getItem, os = P.setItem, orm = P.removeItem;
      P.getItem = function (k) {
        if (GATE.armed && !GATE.released && this === window.localStorage && String(k) === GATE.key) return null;
        return og.apply(this, arguments);
      };
      P.setItem = function (k) {
        if (GATE.armed && !GATE.released && this === window.localStorage && String(k) === GATE.key) return undefined;
        return os.apply(this, arguments);
      };
      P.removeItem = function (k) {
        if (GATE.armed && !GATE.released && this === window.localStorage && String(k) === GATE.key) return undefined;
        return orm.apply(this, arguments);
      };
      P.__f889 = true;
    } catch (e) {}
  }

  function hideBodyChrome() {
    try {
      var st = document.getElementById('v889gatestyle');
      if (!st) {
        st = document.createElement('style'); st.id = 'v889gatestyle';
        st.textContent = '#story,#composer,#topbar,#branches{visibility:hidden !important}';
        (document.head || document.documentElement).appendChild(st);
      }
    } catch (e) {}
  }
  function showBodyChrome() {
    try { var st = document.getElementById('v889gatestyle'); if (st && st.parentNode) st.parentNode.removeChild(st); } catch (e) {}
  }

  function releaseGate() {
    GATE.released = true;
    showBodyChrome();
    closeDialog();
  }

  function gateWaiting() {
    if (uiOff()) return;
    var card = dialog();
    card.appendChild(mk('h2', null, '秘密の物語'));
    card.appendChild(mk('p', null, MSG_CHECKING));
  }
  function gateUnconfirmed(kind) {
    if (uiOff()) return;
    var card = dialog();
    card.appendChild(mk('h2', null, '秘密の物語'));
    card.appendChild(mk('p', null, kind === 'noauth' ? 'この物語を開くには、ログインが必要です。' :
                                   kind === 'offline' ? MSG_OFFLINE_CANON : MSG_UNCONFIRMED));
    var row = mk('div', 'v889row');
    var back = mk('button', null, 'ホームへ戻る'), again = mk('button', 'v889go', 'もう一度確認する');
    row.appendChild(back); row.appendChild(again); card.appendChild(row);
    back.addEventListener('click', function () { try { location.href = 'home.html'; } catch (e) {} }, false);
    again.addEventListener('click', function () { gateWaiting(); probeGate(); }, false);
  }
  function gateLocked() {
    stats.gateShown++;
    if (uiOff()) return;
    askUnlock(function (ok) {
      if (!ok) { gateLockedAgain(); return; }
      stats.reloads++;
      try { location.reload(); } catch (e) { releaseGate(); }
    });
  }
  function gateLockedAgain() {
    var card = dialog();
    card.appendChild(mk('h2', null, '秘密の物語'));
    card.appendChild(mk('p', null, 'この物語を開くにはパスコードが必要です。'));
    var row = mk('div', 'v889row');
    var back = mk('button', null, 'ホームへ戻る'), go = mk('button', 'v889go', 'パスコードを入力する');
    row.appendChild(back); row.appendChild(go); card.appendChild(row);
    back.addEventListener('click', function () { try { location.href = 'home.html'; } catch (e) {} }, false);
    go.addEventListener('click', function () { gateLocked(); }, false);
  }

  function reopen() {
    stats.reloads++;
    try { location.reload(); } catch (e) { releaseGate(); }
  }

  function probeGate() {
    if (GATE.probing) return;
    GATE.probing = true;
    refresh(function () {
      GATE.probing = false;
      var id = GATE.id;
      if (VIS.state === 'ready') {
        if (VIS.visible[id] && !VIS.hidden[id]) { reopen(); return; }   /* 隠されていない */
        if (VIS.hidden[id] && VIS.open) { reopen(); return; }           /* 隠されているが解錠済み */
        GATE.reason = 'HIDDEN'; gateLocked(); return;
      }
      /* ★server の返事が無い ＝ 開けない（D-C2 / D-C3 の fail-closed）。
         ここで cache や「認証が無いこと」を理由に開けてはならない。 */
      if (VIS.state === 'noauth') { GATE.reason = 'NO_AUTH'; gateUnconfirmed('noauth'); return; }
      GATE.reason = 'UNCONFIRMED'; gateUnconfirmed('offline');
    });
  }

  function armGate() {
    var id = storyIdOfUrl();
    if (!id) return;
    GATE.id = id; GATE.key = bodyKeyOf(id);
    if (!localBodyExists(id)) return;             /* (a) */
    if (provenLocalOnly(id)) return;              /* (b) 一度もクラウドへ行っていない */
    GATE.armed = true;
    GATE.reason = readCache().hidden[id] ? 'CACHED_HIDDEN' : 'UNRESOLVED';
    armTrap();
  }

  function bootGate() {
    if (!GATE.armed) return;
    hideBodyChrome();
    var start = function () {
      if (GATE.reason === 'CACHED_HIDDEN') { if (session()) { probeGate(); } else { gateLocked(); } }
      else { gateWaiting(); probeGate(); }
    };
    if (document.body) start();
    else try { document.addEventListener('DOMContentLoaded', start, false); } catch (e) { start(); }
  }

  /* ================================================================== images ==== */
  /* 隠した物語の絵は無認証の画像 URL を **組み立てない**。認証付きの取得経路で受け取り、
     Blob → object URL にして <img> へ流す。★再施錠したら object URL を取り消す。 */
  var imgCache = {}, imgWrapped = false;
  function dropImgUrls() {
    for (var k in imgCache) {
      if (!Object.prototype.hasOwnProperty.call(imgCache, k)) continue;
      try { URL.revokeObjectURL(imgCache[k]); stats.revoked++; } catch (e) {}
    }
    imgCache = {}; imgQueue = {};
    /* 画面に残っている <img> からも外す */
    try {
      var imgs = document.getElementsByTagName('img');
      for (var i = 0; i < imgs.length; i++) {
        var im = imgs[i], s = im.getAttribute && im.getAttribute('src');
        if (s && String(s).indexOf('blob:') === 0) { im.onerror = null; im.removeAttribute('src'); }
      }
    } catch (e) {}
  }
  function imgProtected() {
    return !!(GATE.id && VIS.hidden[GATE.id]);
  }
  function wrapImgUrl() {
    if (imgWrapped) return false;
    var f = window.__v292Dfix400;
    if (!f || typeof f.urlFor !== 'function') return false;
    if (f.urlFor.__f889) { imgWrapped = true; return true; }
    var orig = f.urlFor;
    var w = function (pk) {
      try { if (imgProtected()) { queueImg(pk); return ''; } } catch (e) {}
      return orig.apply(this, arguments);
    };
    try {
      Object.getOwnPropertyNames(orig).forEach(function (k) {
        if (k === 'length' || k === 'name' || k === 'arguments' || k === 'caller' || k === 'prototype') return;
        try { Object.defineProperty(w, k, Object.getOwnPropertyDescriptor(orig, k)); } catch (e) {}
      });
    } catch (e) {}
    w.__f889 = true;
    try { f.urlFor = w; } catch (e) { return false; }
    imgWrapped = true;
    return true;
  }
  function keyOf(pk) { var s = String(pk || ''); return /^v292av2_/.test(s) ? s : ('v292av2_' + s); }
  function toObjectUrl(dataUrl, cb) {
    try {
      var m = /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(String(dataUrl || ''));
      if (!m) { cb(''); return; }
      var type = m[1] || 'image/png', body = m[3] || '';
      var bytes;
      if (m[2]) {
        var bin = atob(body);
        bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      } else {
        bytes = new TextEncoder().encode(decodeURIComponent(body));
      }
      var b = new Blob([bytes], { type: type });
      cb(URL.createObjectURL(b));
    } catch (e) { cb(''); }
  }
  function fetchImg(pk, cb) {
    var k = keyOf(pk);
    if (imgCache[k]) { cb(imgCache[k]); return; }
    stats.getimg++;
    post(withVault({ op: 'getimg', k: k }), function (r, e) {
      if (e || !okOf(r) || !r.j || !r.j.data) { cb(''); return; }
      toObjectUrl(r.j.data, function (u) { if (u) imgCache[k] = u; cb(u); });
    });
  }
  var imgQueue = {};
  function queueImg(pk) {
    var k = keyOf(pk);
    if (imgQueue[k]) return;
    imgQueue[k] = true;
    fetchImg(pk, function (u) { if (u) applyImg(pk, u); });
  }
  function applyImg(pk, url) {
    try {
      var imgs = document.getElementsByTagName('img');
      for (var i = 0; i < imgs.length; i++) {
        var im = imgs[i];
        var a = im.getAttribute && im.getAttribute('data-avpk');
        if (!a) continue;
        if (keyOf(a) !== keyOf(pk)) continue;
        if (im.getAttribute('src') !== url) { im.onerror = null; im.src = url; }
      }
    } catch (e) {}
  }

  /* ==================================================================== HOME ==== */
  function bindHome() {
    try {
      document.addEventListener('click', function (ev) {
        var t = ev && ev.target, take = null, arg = null;
        while (t && t !== document) {
          if (t.id === 'v889openBtn') { take = 'open'; break; }
          if (t.id === 'v889relockBtn') { take = 'relock'; break; }
          if (t.id === 'v889rotateBtn') { take = 'rotate'; break; }
          if (t.id === 'v889hideBtn') { take = 'hide'; arg = t.getAttribute('data-id') || ''; break; }
          if (t.getAttribute && t.getAttribute('data-v889-unhide')) { take = 'unhide'; arg = t.getAttribute('data-v889-unhide') || ''; break; }
          t = t.parentNode;
        }
        if (!take) return;
        try { ev.preventDefault(); ev.stopPropagation(); } catch (e) {}
        if (uiOff()) return;
        if (take === 'open') { ensureUnlocked(function (ok) { if (ok) refresh(); }); return; }
        if (take === 'relock') { relock(); fire(); refresh(); return; }
        if (take === 'rotate') { ensureUnlocked(function (ok) { if (ok) askRotate(null); }); return; }
        if (take === 'hide') { hideStory(arg, null); return; }
        unhideStory(arg, null);
      }, true);
    } catch (e) {}
  }

  /* ==================================================================== boot ==== */
  wrapFetch();                                /* ★同期。以後に読まれる module が掴む fetch になる */
  armGate();                                  /* ★同期。最初の local 読み取りより前 */

  function boot() {
    bootGate();
    bindHome();
    wrapImgUrl();
    setTimeout(wrapImgUrl, 1200);
    setTimeout(wrapImgUrl, 4000);
    if (!GATE.armed) refresh();
  }
  if (document.readyState === 'loading') {
    try { document.addEventListener('DOMContentLoaded', boot, false); } catch (e) { boot(); }
  } else boot();

  window.__v292Dfix889 = {
    __real: true,
    __v: 2,
    uiOff: uiOff,
    state: function () { return VIS.state; },
    listReady: listReady,
    listBlind: listBlind,
    mayShow: mayShow,
    mayShowRow: mayShowRow,
    classOf: classOf,
    classOfRow: classOfRow,
    localOnly: provenLocalOnly,
    localOnlyLabel: function () { return MSG_LOCAL_ONLY; },
    canonState: canonState,
    canonNotice: canonNotice,
    canonSettled: canonSettled,
    isHidden: isHidden,
    hiddenIds: function () { var o = [], k; for (k in VIS.hidden) if (Object.prototype.hasOwnProperty.call(VIS.hidden, k)) o.push(k); return o; },
    unlocked: function () { return !!session(); },
    checkingText: function () { return MSG_CHECKING; },
    onChange: onChange,
    refresh: refresh,
    relock: function () { relock(); fire(); refresh(); },
    rotate: askRotate,
    withVault: withVault,
    hide: hideStory,
    unhide: unhideStory,
    unlock: ensureUnlocked,
    backfill: startBackfill,
    gate: function () { return { armed: GATE.armed, released: GATE.released, id: GATE.id, reason: GATE.reason }; },
    imgSrc: fetchImg,
    limit: function () { return { code: LIMIT.code, retryAfterMs: LIMIT.retryAfterMs, keepLocal: LIMIT.keepLocal, count: LIMIT.count }; },
    status: function () {
      return { uiOff: uiOff(), v: 4, state: VIS.state, canon: canonState(), open: VIS.open, unlocked: !!session(),
               hidden: Object.keys(VIS.hidden).length, visible: Object.keys(VIS.visible).length,
               loggedIn: loggedIn(), fetchWrapped: fetchWrapped,
               backfill: { running: backfill.running, left: backfill.queue.length, done: backfill.done,
                           skipped: backfill.skipped, capped: backfill.capped, storyId: backfill.storyId,
                           probing: backfill.probing, probeMode: backfill.probeMode,
                           probed: backfill.probed, owned: backfill.owned, orphan: backfill.orphan,
                           probeFail: backfill.probeFail, storyRequired: backfill.storyRequired },
               limit: { code: LIMIT.code, retryAfterMs: LIMIT.retryAfterMs, keepLocal: LIMIT.keepLocal, count: LIMIT.count },
               gate: { armed: GATE.armed, released: GATE.released, reason: GATE.reason },
               stats: stats };
    }
  };
  try { console.log(TAG, 'loaded v4', uiOff() ? 'UI-OFF(filter stays)' : 'ON'); } catch (e) {}
})();
