/* =====================================================================
 * v292DfixSTARTICON-start-icons.js — 物語を始めたとき、主人公と登録キャラの最初の絵を自動で作る（★STARTICON・laneSTARTICON・2026-11-07・Local 候補・本番 HOLD）
 * ---------------------------------------------------------------------
 * Owner の希望（2026-11-07）:「スタートした時はアイコンは自動で生成されない？自動で生成される様にして欲しい。工程数が少ない方がいい。」
 *
 * ■やること（新しい通信経路は作らない。手動の「🎨 絵を作る」→「この外見で作る」と同じ部品を、同じ順に呼ぶだけ）
 *   物語の始まり（このページで最初に見たときのターン数が 2 以下）に 1 回だけ、絵の無いキャラ（主人公 1 人＋登録 NPC 最大 3 人＝最大 4 枚）について:
 *   A) 外見の下書き: 設定の説明文（cast.desc）から。ICONUX2 の近道（説明文の見た目の句をそのまま・AI なし）か、LC1 の外見の案（文章 AI 1 回）
 *      ＝ window.__v292DfixLC1prop.propose（ICONUX2 が包んだもの）をそのまま呼ぶ。確定済みの外見があるキャラは何もしない（黙って変えない）。
 *      説明文が空・説明文に性的な語／若く見える人物の体の語がある（ICONUX2 の directCheck が SENSITIVE_* / YOUTH_BODY_DESC）キャラは自動では作らない（手動の 2 タップに残す）。
 *      → A.setProfile(ownerConfirmed, origin 'starticon_auto') で保存（Owner の「自動で作って」を確認の代わりにする＝GPT #127-RI ① 条件付き GO）。
 *      ★STARTICON2（#127-RI ① の条件）: 保存する外見には由来 profile.origin='starticon_auto'・profile.basis='desc'（説明文の句そのまま）| 'ai'（文章 AI の案。
 *      説明文に無い特徴を含み得る）が付く＝本人が確定した外見（origin なし）と区別できる。本人があとで「この外見で作る」「この外見で確定」を押すと、
 *      origin の無い本人の外見で普通に置き換わる（＝格上げ）。自動の保存は、サーバーにもう外見があるキャラには書かない（APPEARANCE_EXISTS・av2-data の CAS の中で判定）。
 *   B) 表示を揃える再読み込み（setProfile が実際に書いたときだけ・1 回）: side-port の後はこのページの保存が止まる（fix733 TYPE A）ので、
 *      入力中・生成中・画面が開いている・操作の直後でないときに 1 回だけ再読み込みする（LC1 / B37 と同じ。短い表示つき）。
 *   C) 最初の絵: A.ensureFirst を 1 人 1 回ずつ（順番に・生成中のターンがあれば終わるまで待つ）。結果が分からない（5xx・時間切れ）・上限・混雑・
 *      利用記録の不調・使えない（403 / 501 = 公開許可の外 / HOLD）→ そこで止める。自動の再試行はしない。422（imgsafe 等）はそのキャラだけ失敗にして次へ。
 *      ★93-j（GPT #127-RO ①・Worker v46.38 の口座の札）: 200 IN_FLIGHT（同じアカウントの別の絵＝MIDICON の mx_ensure・別端末・手動が札を持っている）を受けたら、
 *      そのキャラだけ 1 回だけ再試行する。すぐには送らない: 札が空く頃（20〜40 秒後・Worker の札は最長 300 秒）まで待ち、その間はほかのキャラにも送らない
 *      （同じ口座の札なので送っても IN_FLIGHT になるだけ）。待った後に portrait.list でそのキャラに絵が付いたかを確かめ、付いていれば送らない（FILLED）。
 *      まだなら ensureFirst をもう 1 回（送る前に「再試行した」と書く＝閉じても 3 回目は無い）。2 回目も IN_FLIGHT なら、そのキャラはそこで見送る（IN_FLIGHT2・手動は残る）。
 *      5xx・通信断・時間切れ（OUTCOME_UNKNOWN / GENERATION_FAILED）・402 / 403 / 429 は今までどおり止まる（再試行しない）。kill: v292DfixSTARTICONRetryOff='1' = 93-i と同じ（再試行しない）。
 *      ★93-k（Owner 実測）: B の再読み込みは、👥 キャラ一覧を「見ているだけ」（文字の入った欄・確認欄・ピッカー・ほかのダイアログが無い）なら一覧が開いていても進め、
 *      読み直した後に一覧を 1 回だけ開き直す。一覧の中で編集中などで待つ間は「キャラ一覧を閉じると絵の準備を続けます」を 1 回出す。
 *      C で絵が付いたら、一覧の「絵を作る／絵を変える」の元（LC1 の「絵あり」の控え）も読み直してもらう（LC1.refreshPtr・読むだけ）。kill: v292DfixSTARTICONListOff='1' = 93-j と同じ。
 * ■重複を作らない
 *   ・物語ごとに 1 回: 作った端末（URL new=1）以外の端末・タブでは、どのキャラにもまだ絵が無いときだけ始める（ほかの端末が始めていれば何もしない）。
 *   ・この端末: localStorage 'v292DfixSTARTICON_v1' に物語ごとの段階（plan / img / done / stop）とキャラごとの結果（character_id のハッシュ → 理由コード）。
 *     送る前に「送った」と書く（送信中に閉じても、次に開いたとき送り直さない）。名前・本文・番号そのものは残さない。
 *   ・別の端末: 送る前に portrait.list（サーバーの絵の有無）。ensureFirst 自身も送る直前にもう一度読む。Worker は 1 キャラ 1 本の lease ＋絵があれば EXISTS（費用 0）。
 *     setProfile は CAS（サーバーと一致しないと LOCAL_NOT_SYNCED で書かない）。
 * ■止める・範囲
 *   ・kill: localStorage v292DfixSTARTICONOff='1'（何もしない）。v292DfixSTARTICONNoAI='1' = 文章 AI の案を使わない（説明文の句をそのまま使える人だけ）。
 *   ・鍵: アカウントの starticon1（ADMF1・管理者画面のアカウントごと／全体の切り替え）だけ。Owner / お客さまの区別はコードに持たない（★STARTICON2・Owner 2026-11-08）。
 *     鍵が 0・行なし・旧 Worker（鍵を返さない）・停止中のアカウント（accountFlags が来ない）→ 通信 0・表示 0（イニシャルの丸のまま）。
 *     お客さまの画像の守り（月の上限 limitUsd・1 日の枚数・imgsafe・停止/利用権・公開許可）はすべて Worker のまま（ensure_first は手動と同じ入口）。
 *     ICONUX2 が ON（説明文の近道と検査の部品）。LC1（lc1）の ON は要らない（★STARTICON2: 外見の案の部品 LC1prop は LC1 の ON/OFF に関係なく読み込まれる）。
 *   ・サーバーが断ったとき（403 / 501 / 402 / 429・お客さまの 503 CUSTOMER_IMG_*）はこのタブではもう試さない（sessionStorage 'v292DfixSTARTICON_hold'）。
 *   ・新しい物語だけ（★STARTICON2）: 物語の ID に入っている作成時刻から 6 時間以内、かつ開いたときのターン数 2 以下。ID が読めない・古い物語 → 何もしない（NOT_NEW）。
 *   ・端末の上限: 1 日（UTC）に自動で始める物語 5 つまで。1 物語 4 枚まで。
 *     ★LIM1（laneLIM1 2026-11-13・Owner「1 端末 1 日 5 物語はおしんはいらない・管理者画面でアカウントごとに」）: この 2 つは管理者画面の「上限の設定」
 *     （starticon_day_stories / starticon_story_imgs。アカウントの行 → 種類の既定 → 行なし）で変えられる。読むのは ADMF1.limit（/auth/me の accountLimits）。
 *     行なし・旧 Worker・答えが別アカウント・kill v292DfixLIM1Off='1' → 今の定数（5 つ・4 枚）。-1 = 無制限。1 物語 N 枚 = 主人公 1 ＋ 登録キャラ N−1（0 = 作らない）。
 *   ・v292Dav2Off='1'・Vault の物語（fix889 で非表示）・ログインしていない・schema 2 でない → 何もしない。
 * ■書かないもの: S・長期記憶・名簿・sys には何も書かない（書くのは setProfile が書く外見だけ＝手動と同じ）。B37 の自動案内の印
 *   'v292DfixB37onb_<id>' だけは「STARTICON が引き受けた」として付ける（👥 が勝手に開かないように。手動の入口はそのまま）。
 * ■診断: window.__v292DfixSTARTICON.status()
 * ===================================================================== */
(function (root) {
  'use strict';
  if (typeof window === 'undefined' || root.__v292DfixSTARTICON) return;
  var VER = 'starticon-d-20261109-ifretry-listopen+lim1';   /* ★93-k: キャラ一覧を開いたままでも 1 回の再読み込みへ進む・一覧の行の読み直し */
  var KILL = 'v292DfixSTARTICONOff', NOAI = 'v292DfixSTARTICONNoAI', LSK = 'v292DfixSTARTICON_v1', HOLDK = 'v292DfixSTARTICON_hold', RETRY_OFF = 'v292DfixSTARTICONRetryOff';   /* ★93-j */
  var LIST_OFF = 'v292DfixSTARTICONListOff', REOPENK = 'v292DfixSTARTICON_reopen';   /* ★93-k: kill（= 93-j と同じ再読み込みの待ち方）・再読み込みの後に一覧を開き直す印（sessionStorage・このタブだけ） */
  var IF_WAIT_MS = 20000, IF_SPAN_MS = 20000;   /* ★93-j: IN_FLIGHT の後に待つ時間 = 20 秒 + 0〜20 秒（Worker の口座の札 MX_LEASE_MS = 300 秒より十分短い・生成 1 枚より長い） */
  var CAP = { npcs: 3, maxTurns: 2, dayStarts: 5, bTries: 2, newMs: 6 * 3600 * 1000 };
  var POLL_MS = 1500, STABLE_MS = 3000, AUTO_MAX_MS = 240000, WAIT_MS = 20000, CLEAN_MS = 45000;
  function lsGet(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { root.localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function ssGet(k) { try { return root.sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { root.sessionStorage.setItem(k, v); } catch (e) {} }
  var LOG = []; function note(o) { try { o.t = Date.now(); o.inFlight = inFlight(); LOG.push(o); if (LOG.length > 120) LOG.shift(); } catch (e) {} }
  var stats = { plans: 0, proposals: 0, direct: 0, sets: 0, setFail: 0, ef: 0, created: 0, exists: 0, efFail: 0, reloads: 0, skipped: 0, sentWhileInFlight: 0, inflight: 0, ifRetry: 0, ifFilled: 0, ifGiveUp: 0, listReload: 0, listWaitToast: 0, listReopen: 0, listRefresh: 0 };   /* ★93-j: +inflight / ifRetry / ifFilled / ifGiveUp ★93-k: +list* */

  /* ---------- environment (same readers as B37 / LC1 / MIDICON) ---------- */
  function state() { try { return (typeof root.__chronicleGetState === 'function') ? root.__chronicleGetState('starticon') : null; } catch (e) { return null; } }
  function inFlight() { try { var S = state(); return !!(S && S.inFlight); } catch (e) { return true; } }
  function F697() { return root.__v292Dfix697 || null; }
  function A() { return root.__chronicleAssetV2 || null; }
  function PR() { return root.__v292DfixLC1prop || null; }
  function UX() { var x = root.__v292DfixICONUX2; return (x && x.on === true && typeof x.directCheck === 'function') ? x : null; }
  function LC1() { var x = root.__v292DfixLC1; try { return (x && typeof x.on === 'function' && x.on()) ? x : null; } catch (e) { return null; } }
  function sid() { try { var f = F697(); var s = f && f.status ? f.status().storyId : null; return s ? String(s) : null; } catch (e) { return null; } }
  function doc2() { try { var m = root.__v292Dav2Map; return !!(m && typeof m.docSchema2 === 'function' && m.docSchema2() === true); } catch (e) { return false; } }
  function loggedIn() { try { var f = F697(); return !!(f && f.status && f.status().loggedIn); } catch (e) { return false; } }
  function acct() { try { var F = root.__v292Dfix893; var me = (F && typeof F.me === 'function') ? F.me() : null; return (me && me.accountId) ? String(me.accountId) : null; } catch (e) { return null; } }
  /* ★LIM1: the account's own caps (admin page 上限の設定). No row / old Worker / other account / kill → the constants above (= as before) */
  function limOf(k, dflt) { try { var X = root.__v292DfixADMF1; if (!X || typeof X.limit !== 'function') return dflt; var v = X.limit(k, dflt); return (v === Infinity || (typeof v === 'number' && v >= 0 && v === Math.floor(v))) ? v : dflt; } catch (e) { return dflt; } }
  function capDayStarts() { return limOf('starticon_day_stories', CAP.dayStarts); }
  function storyCap() { var n = limOf('starticon_story_imgs', null); if (n === null) return { hero: true, npcs: CAP.npcs, src: 'const' };   /* = before: hero 1 + NPCs 3 */
    if (n === Infinity) return { hero: true, npcs: Infinity, src: 'row' }; return { hero: n >= 1, npcs: Math.max(0, n - 1), src: 'row' }; }
  function admfOn() { try { var X = root.__v292DfixADMF1; return !!(X && typeof X.gate === 'function' && X.gate('starticon1', false) === true); } catch (e) { return false; } }   /* ★STARTICON2: 自分の鍵 starticon1（管理者画面）。行なし = OFF */
  function vaultHidden(id) { try { var V = root.__v292Dfix889; if (!V || typeof V.isHidden !== 'function') return true; return !!V.isHidden(id); } catch (e) { return true; } }   /* fail-closed */
  function killed() { return lsGet(KILL) === '1' || lsGet('v292Dav2Off') === '1'; }
  function gateWhy() {
    if (killed()) return 'kill';
    if (!admfOn()) return 'flag-off';
    if (!loggedIn() || !acct()) return 'not-logged-in';
    if (ssGet(HOLDK)) return 'hold:' + ssGet(HOLDK);
    if (!UX() || !PR() || typeof PR().propose !== 'function') return 'iconux2-off';
    var a = A(); if (!a || typeof a.ensureFirst !== 'function' || typeof a.setProfile !== 'function' || typeof a.suggestAppearance !== 'function') return 'no-av2';
    if (!doc2()) return 'not-schema2';
    var id = sid(); if (!id) return 'no-story';
    if (vaultHidden(id)) return 'vault';
    return '';
  }
  function av2Idle() {
    var a = A(); if (!a || typeof a.status !== 'function') return false;
    try { var s = a.status(); if (!s || !s.schema2 || (s.reg && s.reg.busy)) return false;
      if (a.pending && a.pending()) return false; if (a.blocked && a.blocked()) return false; if (a.conflict && a.conflict()) return false; return true; } catch (e) { return false; }
  }
  function canonicalNow(id) {
    try { var F5 = root.__v292Dfix705; if (!F5 || typeof F5.docAuthority !== 'function') return false; var d = F5.docAuthority();
      return !!(d && String(d.id) === String(id) && d.fresh === true && d.present === true && String(d.authority || '') === 'canonical' && d.schema === 2); } catch (e) { return false; }
  }
  function prepSettled() { try { var B = root.__v292Dbav2; var p = B && typeof B.prep === 'function' ? B.prep() : null; return !(p && p.on) || !!(p.done && !p.failed); } catch (e) { return false; } }
  function saveClean(id) { try { var F = root.__v292Dfix781; var m = (F && typeof F.marker === 'function') ? F.marker(id) : null; return !!(m && m.state === 'CLEAN' && !m.inFlightSave); } catch (e) { return false; } }
  function xtabStale() { try { var g = root.__v292Dfix945; return !!(g && typeof g.isStale === 'function' && g.isStale()); } catch (e) { return true; } }
  function lc1Busy() { try { var x = LC1(); var s = x && x.status ? x.status() : null; return !!(s && s.busyOp); } catch (e) { return true; } }
  function quiet() { return !inFlight() && av2Idle() && !lc1Busy() && !xtabStale(); }
  function ready(id) { return canonicalNow(id) && prepSettled() && saveClean(id) && quiet(); }
  function same(id, a0) { return sid() === id && acct() === a0 && doc2(); }
  function waitFor(pred, ms, cb) { var t0 = Date.now(); (function poll() { var ok = false; try { ok = pred(); } catch (e) {} if (ok) return cb(true); if (Date.now() - t0 > ms) return cb(false); setTimeout(poll, 500); })(); }
  function genderOf(v) { return (v === '女性' || v === '男性') ? v : ''; }
  /* ★STARTICON2: when the story was created = the ms timestamp in its id ('s' + Date.now().toString(36) + 1–2 random base-36 chars:
     home.html newStory / fix819 newId). Anything else (older id formats, out-of-range) → null = not a new story (never automatic). */
  function bornMs(id) {
    var m = /^s([0-9a-z]{8})[0-9a-z]{1,2}$/.exec(String(id || '')); if (!m) return null;
    var t = parseInt(m[1], 36); if (!(t > 1767225600000 && t < Date.now() + 86400000)) return null;   /* 2026-01-01 .. now + 1 day */
    return t;
  }
  function isNewStory(id) { var t = bornMs(id); return t !== null && Date.now() - t <= CAP.newMs; }
  function lore() { try { var S = state(); return S && S.scene && typeof S.scene.lore === 'string' ? S.scene.lore : ''; } catch (e) { return ''; } }
  function chars() {   /* = B37 / LC1 chars(): hero first, then the NPCs in cast order; DELETED / DEPARTED / no id / no name are skipped */
    var S = state(); if (!S || !S.cast) return [];
    var out = [], c = S.cast;
    var add = function (e, hero) { if (!e || typeof e !== 'object' || typeof e.character_id !== 'string') return; if (e.status === 'DELETED' || e.status === 'DEPARTED') return;
      var nm = String(e.name || '').normalize('NFC').trim(); if (!nm) return; out.push({ id: e.character_id, name: nm, hero: !!hero }); };
    add(c.hero, true); (Array.isArray(c.npcs) ? c.npcs : []).forEach(function (n) { add(n, false); });
    return out;
  }
  function suggest(cid) { try { var s = A().suggestAppearance(cid); return (s && s.ok) ? s : null; } catch (e) { return null; } }
  function pointers(id, cb) {
    var f = F697(); if (!f || typeof f.assetV2Read !== 'function') return cb(null);
    f.assetV2Read('portrait.list', { story_id: id }, function (r, err) {
      var j = r && r.j; if (err || !r || r.status !== 200 || !j || !Array.isArray(j.portraits)) return cb(null);
      var by = {}; j.portraits.forEach(function (p) { if (p && typeof p.character_id === 'string') by[p.character_id] = 1; }); cb(by);
    });
  }
  function listOn() { return lsGet(LIST_OFF) !== '1'; }   /* ★93-k */
  function refreshPortraits() { try { var P = root.__chronicleAv2Portrait; if (P && typeof P.refresh === 'function') P.refresh(); } catch (e) {}
    /* ★93-k（Owner 実測 2026-11-09）: キャラ一覧を開いたまま段 B が絵を付けると、一覧の「🎨 絵を作る／絵を変える」の元になる LC1 の
       「絵あり」の控え（45 秒）が古いままで、絵が見えているのに「絵を作る」のままだった（押しても ensureFirst が EXISTS で止まる＝費用 0）。
       絵の表示の読み直しと一緒に、LC1 の控えも読み直してもらう（読むだけ・旧い LC1 には口が無いので何もしない） */
    if (listOn()) { try { var L = root.__v292DfixLC1; if (L && typeof L.refreshPtr === 'function') { stats.listRefresh++; L.refreshPtr('starticon'); } } catch (e2) {} } }

  /* ---------- small device record (no names / ids: a character is kept only as a hash) ---------- */
  function today() { return new Date().toISOString().slice(0, 10); }
  function hk(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; } return 'h' + h.toString(36); }
  function rec() { var r = null; try { r = JSON.parse(lsGet(LSK) || 'null'); } catch (e) { r = null; } if (!r || r.v !== 1 || typeof r.st !== 'object' || !r.st) r = { v: 1, day: today(), starts: 0, st: {} }; if (r.day !== today()) { r.day = today(); r.starts = 0; } return r; }
  function recSave(r) { var ks = Object.keys(r.st); if (ks.length > 40) ks.sort(function (a, b) { return (r.st[a].at || 0) - (r.st[b].at || 0); }).slice(0, ks.length - 40).forEach(function (k) { delete r.st[k]; }); lsSet(LSK, JSON.stringify(r)); }
  function soOf(id) { var r = rec(); return r.st[hk(id)] || null; }
  function soSet(id, fn) { var r = rec(), k = hk(id); var so = r.st[k] || { p: null, at: Date.now(), t: [], a: {}, b: {} }; fn(so, r); so.at = Date.now(); r.st[k] = so; recSave(r); return so; }
  function claimB37(id) {   /* B37 の自動案内（LC1 では 👥 が勝手に開く）を「STARTICON が引き受けた」にする。B37 自身の 1 回の印と同じ形 */
    try { var k = 'v292DfixB37onb_' + id; if (lsGet(k)) return; if (lsGet('v292DfixB37bOff') === '1') return; lsSet(k, JSON.stringify({ v: 1, st: 'starticon', at: Date.now() })); note({ kind: 'B37_CLAIMED' }); } catch (e) {}
  }

  /* ---------- outcome tables ---------- */
  var SENSITIVE = { SENSITIVE_DESC: 1, YOUTH_BODY_DESC: 1, SENSITIVE_DRAFT: 1 };
  var SET_STOP = { LOCAL_NOT_SYNCED: 1, REBASE_REQUIRED: 1, READ_FAIL: 1, NOT_CANONICAL_ROW: 1, CONFLICT: 1, NOT_APPLIED: 1, READBACK_FAIL: 1, APPLIED_SERVER_MOVED: 1,
    SERVER_NOT_SCHEMA2: 1, AV2_OFF: 1, AV2_FLAG_OFF: 1, NOT_SCHEMA2_DOCUMENT: 1, REGISTRATION_PENDING: 1, NO_LOCAL_RECORD: 1 };   /* = LC1 / B37 STOP_SET (+2) */
  var EF_OK = { CREATED: 1, EXISTS: 1, CREATED_CONFIRMED: 1 };
  var EF_STOP = { BUDGET: 1, RATE_LIMITED: 1, LEDGER_UNHEALTHY: 1, ASSET_V2_UNAVAILABLE: 1, NOT_FOUND: 1, GENERATION_FAILED: 1, OUTCOME_UNKNOWN: 1, READ_FAIL: 1,
    AV2_OFF: 1, AV2_FLAG_OFF: 1, NOT_SCHEMA2_DOCUMENT: 1, REBASE_REQUIRED: 1, REGISTRATION_BLOCKED: 1 };
  var EF_HOLD = { ASSET_V2_UNAVAILABLE: 1, BUDGET: 1, RATE_LIMITED: 1 };   /* 403 / 501（公開許可の外・HOLD・停止中）・402（上限）・429（毎分 / お客さまの 1 日の枚数）→ このタブではもう試さない */
  var HOLD_ERR = /^(CUSTOMER_IMG_|ACCOUNT_|ENTITLEMENT_)/;   /* ★STARTICON2: the Worker's customer refusals that arrive as 503 (OUTCOME_UNKNOWN on the device) — also held for the tab */
  function holdOf(code, x) { if (EF_HOLD[code]) return code; var e = String((x && x.err) || ''); return (code === 'OUTCOME_UNKNOWN' && HOLD_ERR.test(e)) ? e.slice(0, 40) : null; }

  /* ---------- page state ---------- */
  var X = { story: null, t0: Date.now(), firstTurns: null, okSince: 0, busy: false, pageStop: null, needReload: false, reloaded: false, bDone: false, last: null, why: null, leaseUntil: 0 };   /* ★93-j: leaseUntil */
  var lastAct = 0;
  try { ['pointerdown', 'touchstart', 'mousedown', 'keydown', 'input', 'wheel'].forEach(function (ev) { document.addEventListener(ev, function () { lastAct = Date.now(); }, true); }); } catch (eA) {}
  var BUSY_SEL = '.v292Dfix145-modal, [role="dialog"], [aria-modal="true"], dialog[open], [data-av2-inask], #v292DfixFLW2-overlay, #v292Dav2-picker';
  /* ★93-k: キャラ一覧（.v292Dfix145-modal）を「見ているだけ」か。一覧の中に、文字の入った入力欄・選択欄・チェックされた欄・
     確認欄（[data-av2-inask]）・ピッカー・ほかのダイアログが見えていれば「見ているだけ」ではない（入力中の文字・選んだものを失わない） */
  function vis(e) { try { return !!(e && e.getClientRects && e.getClientRects().length); } catch (e2) { return false; } }
  function listOnlyIdle(q) {
    var mo = document.querySelector('.v292Dfix145-modal'); if (!mo || !vis(mo)) return false;
    for (var i = 0; i < q.length; i++) { var e = q[i]; if (!vis(e)) continue; if (e === mo) continue; if (!mo.contains(e)) return false; if (e.matches && e.matches('[data-av2-inask], dialog[open], [role="dialog"], [aria-modal="true"]')) return false; }
    var f = mo.querySelectorAll('input, textarea, select, [contenteditable="true"], [contenteditable=""]');
    for (var j = 0; j < f.length; j++) { var x = f[j]; if (!vis(x)) continue; var tp = String(x.type || '').toLowerCase();
      if (tp === 'button' || tp === 'submit' || tp === 'reset' || tp === 'hidden' || tp === 'image') continue;
      if (tp === 'checkbox' || tp === 'radio') { if (x.checked) return false; continue; }
      if (x.tagName === 'SELECT') return false;   /* 選択欄は外見を編集しているときだけ出る（その場合は待つ） */
      if (String(x.isContentEditable ? x.textContent : x.value || '').trim()) return false; }
    return true;
  }
  function screenBusy(allowList) {
    try { var q = document.querySelectorAll(BUSY_SEL), modal = false; for (var i = 0; i < q.length; i++) if (q[i].getClientRects && q[i].getClientRects().length) { modal = true; break; }
      if (modal && !(allowList && listOnlyIdle(q))) return 'MODAL';
      /* 一覧を開くと検索欄に印が来るが、空なら下の EDITING には当たらない（文字が入っていれば待つ） */
      var ae = document.activeElement; if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable) && String(ae.value || ae.textContent || '').length > 0) return 'EDITING';
      var inp = document.getElementById('inp'); if (inp && String(inp.value || '').trim()) return 'DRAFT';
      if (Date.now() - lastAct < 4000) return 'RECENT_ACTION'; } catch (e) { return 'ERR'; }
    return null;
  }
  function finish(why) { X.busy = false; X.last = { why: why, at: Date.now() }; note({ kind: 'END', why: why }); }

  /* ---------- A: draft → setProfile (sequential) ---------- */
  function phaseA(id) {
    X.busy = true; var a0 = acct();
    pointers(id, function (by) {
      if (!by) { X.pageStop = 'READ_FAIL'; return finish('A_READ_FAIL'); }   /* nothing sent; the next page load may try again */
      if (!same(id, a0)) return finish('A_RECHECK');
      /* targets: no picture on the server yet AND a draft is possible (confirmed appearance, or a description that is not sensitive) — then the cap (hero 1 + NPCs 3) */
      var cs = chars(), tg = [], npc = 0, skip = {}, sc = storyCap();   /* ★LIM1 */
      /* once per story across devices: only the device that created the story (URL new=1) starts with pictures already present; any other device /
         tab starts only when NO character of the story has a picture yet (otherwise another device — or the Owner — already did the start) */
      if (!isNew && cs.some(function (c) { return by[c.id]; })) { soSet(id, function (so) { so.p = 'done'; so.why = 'OTHER_DEVICE'; }); return finish('A_OTHER_DEVICE'); }
      cs.forEach(function (c) {
        if (by[c.id]) return;
        if (c.hero ? (!sc.hero || tg.some(function (t) { return t.hero; })) : npc >= sc.npcs) return;   /* ★LIM1: sc = { hero: true, npcs: 3 } without a row (as before) */
        var s = suggest(c.id), why = null, dc = null;
        if (!s) why = 'NO_ENTRY';
        else if (!(s.current && s.current.appearance)) {
          var desc = String(s.desc || '').trim();
          if (!desc) why = 'SKIP_NO_DESC';   /* only from the description the story already has */
          else { try { dc = UX().directCheck(desc, s.gender); } catch (e) { dc = { ok: false, why: 'THREW' }; }
            if (!dc.ok && SENSITIVE[dc.why]) why = 'SKIP_' + dc.why;   /* left to the manual 2-tap (the Owner reads the draft) */
            else if (!dc.ok && lsGet(NOAI) === '1') why = 'SKIP_NOAI'; }
        }
        if (why) { skip[hk(c.id)] = why; stats.skipped++; return; }
        if (!c.hero) npc++; c.dc = dc; tg.push(c);
      });
      if (!tg.length) { soSet(id, function (so) { so.p = 'done'; so.why = 'NOTHING'; so.a = skip; }); return finish('A_NOTHING'); }
      tg.sort(function (a, b) { return (b.hero ? 1 : 0) - (a.hero ? 1 : 0); });
      soSet(id, function (so, r) { so.p = 'plan'; so.t = tg.map(function (c) { return hk(c.id); }); so.a = skip; r.starts = (r.starts || 0) + 1; });
      stats.plans++; note({ kind: 'PLAN', n: tg.length, hero: tg.some(function (c) { return c.hero; }), skipped: Object.keys(skip).length, cap: sc.src });
      var i = 0, setAny = false, wrote = false;
      var endA = function (why) {
        soSet(id, function (so) { if (setAny) so.p = 'img'; else { so.p = 'done'; so.why = why || 'NO_PROFILE'; } });
        if (setAny && wrote) { X.needReload = true; return finish('A_DONE_RELOAD'); }
        if (setAny) { X.busy = false; return phaseB(id); }   /* every target already had a confirmed appearance → no write, no reload */
        finish('A_DONE_NONE');
      };
      var next = function () {
        if (i >= tg.length) return endA(null);
        if (!same(id, a0)) return endA('RECHECK');
        var c = tg[i++], h = hk(c.id), s = suggest(c.id);
        var mark = function (code) { soSet(id, function (so) { so.a[h] = code; }); };
        if (!s) { mark('NO_ENTRY'); return next(); }
        if (s.current && s.current.appearance) { setAny = true; mark('conf'); return next(); }   /* confirmed appearance: never changed silently */
        var desc = String(s.desc || '').trim(), dc = c.dc || { ok: false, why: '?' };
        waitFor(quiet, WAIT_MS * 6, function (q) {
          if (!q) { mark('NOT_QUIET'); return endA('NOT_QUIET'); }   /* nothing sent for this character */
          var input = { name: c.name, gender: genderOf(s.gender), desc: desc, confirmed: '', context: lore().slice(0, 120), hero: c.hero };
          stats.proposals++; if (dc.ok) stats.direct++;
          note({ kind: 'PROPOSE', direct: !!dc.ok });
          PR().propose(input, function (res) {
            res = res || {};
            var g = genderOf(s.gender) || genderOf(res.gender);
            var pv = A().previewProfile ? A().previewProfile({ gender: g, appearance: res.appearance || '' }) : { gender: g, appearance: String(res.appearance || '').trim() };
            if (!res.ok || !pv.appearance) { mark('PROPOSE_' + String(res.code || 'EMPTY').slice(0, 24)); return next(); }
            waitFor(function () { return saveClean(id) && quiet(); }, CLEAN_MS, function (ok) {
              if (!ok) { mark('NOT_CLEAN'); return endA('NOT_CLEAN'); }
              if (!same(id, a0)) return endA('RECHECK');
              var basis = (res.direct === true || res.aiCalled === false) ? 'desc' : 'ai';   /* ★STARTICON2: unknown → 'ai' (the less trusted label) */
              stats.sets++; if (inFlight()) stats.sentWhileInFlight++; note({ kind: 'SET', ai: basis === 'ai' });
              A().setProfile(c.id, { gender: pv.gender, appearance: pv.appearance, ownerConfirmed: true, origin: 'starticon_auto', basis: basis }, function (r2) {
                if (r2 && r2.ok) { setAny = true; if (!r2.noop) wrote = true; mark('set'); note({ kind: 'SET_OK', noop: !!r2.noop, mirror: r2.mirror, basis: basis }); return setTimeout(next, 200); }
                var code = (r2 && r2.code) || 'UNKNOWN';
                if (code === 'APPEARANCE_EXISTS') { setAny = true; mark('conf'); stats.exists++; note({ kind: 'SET_EXISTS' }); return setTimeout(next, 200); }   /* ★STARTICON2: an appearance appeared on the server (another device / the Owner) — never replaced */
                stats.setFail++; mark('SET_' + String(code).slice(0, 24)); note({ kind: 'SET_FAIL', code: code });
                if (code === 'APPLIED_SERVER_MOVED') { wrote = true; X.needReload = true; }
                if (SET_STOP[code]) return endA('SET_' + code);
                next();
              });
            });
          });
        });
      };
      next();
    });
  }

  /* ---------- C: ensureFirst (one per character, sequential, never resent — except ONE retry after 200 IN_FLIGHT, ★93-j) ---------- */
  function retryOn() { return lsGet(RETRY_OFF) !== '1'; }
  function phaseB(id) {
    if (X.busy || X.bDone) return;
    var so0 = soOf(id); if (!so0 || so0.p !== 'img') return;
    X.busy = true; X.bDone = true; var a0 = acct();
    var so = X.bCounted ? soOf(id) : soSet(id, function (s) { s.bt = (s.bt || 0) + 1; }); X.bCounted = true;   /* tries are counted per page load */
    if (so.bt > CAP.bTries) { soSet(id, function (s) { s.p = 'stop'; s.why = 'B_TRIES'; }); return finish('B_TRIES'); }
    /* ★93-j: a character whose first send got IN_FLIGHT and was not retried yet (the page closed while waiting) is still to do — its one retry */
    var todo = chars().filter(function (c) { var h = hk(c.id); var b = so.b[h], r = so.r || {}; return so.t.indexOf(h) >= 0 && (so.a[h] === 'set' || so.a[h] === 'conf') && (!b || (b === 'IN_FLIGHT' && !r[h] && retryOn())); });
    var i = 0, transient = 0;
    todo.forEach(function (c) { var t = so.ra && so.ra[hk(c.id)]; if (typeof t === 'number' && t > (X.leaseUntil || 0)) X.leaseUntil = Math.min(t, Date.now() + IF_WAIT_MS + IF_SPAN_MS); });   /* ★93-j: a reload in the middle of the wait keeps waiting */
    var endB = function (why, hold) {
      soSet(id, function (s) { if (why) { s.p = 'stop'; s.why = why; } else s.p = 'done'; });
      if (hold) ssSet(HOLDK, hold);
      refreshPortraits(); finish(why ? 'B_STOP_' + why : 'B_DONE');
    };
    var send = function (c, h, again) {   /* the one billable request for this character (again = the ONE retry after IN_FLIGHT) */
      soSet(id, function (s) { if (again) { s.r = s.r || {}; s.r[h] = 1; } s.b[h] = 'SENT'; });   /* written BEFORE the call: a page closed mid-call never resends (and never retries twice) */
      stats.ef++; if (again) stats.ifRetry++; if (inFlight()) stats.sentWhileInFlight++; note({ kind: again ? 'EF_RETRY' : 'EF', hero: c.hero });
      A().ensureFirst(c.id, {}, function (x) {
        var code = (x && x.code) || 'UNKNOWN';
        if ((code === 'REGISTRATION_IN_PROGRESS') && x && !x.calls && transient < 5) { transient++; soSet(id, function (s) { if (again) { s.b[h] = 'IN_FLIGHT'; if (s.r) delete s.r[h]; } else delete s.b[h]; }); if (again) stats.ifRetry--; return setTimeout(next, 2000); }   /* refused on the device before any request (★93-j: a retry stays a retry) */
        note({ kind: 'EF_RES', code: code, calls: x && x.calls, retry: again ? 1 : 0 });
        if (code === 'IN_FLIGHT' && x && x.calls && retryOn()) {   /* ★93-j: the Worker answered 200 IN_FLIGHT (the account's lease is held by another picture) — nothing was made, nothing billed */
          stats.inflight++; stats.efFail++;
          X.leaseUntil = Date.now() + IF_WAIT_MS + Math.floor(Math.random() * IF_SPAN_MS);   /* no request to ANY character until then (the same account lease would answer IN_FLIGHT again) */
          if (!again) { soSet(id, function (s) { s.b[h] = 'IN_FLIGHT'; s.ra = s.ra || {}; s.ra[h] = X.leaseUntil; }); return next(); }   /* i is not advanced: the same character comes again after the wait (its one retry). ra = not before (kept across a reload) */
          stats.ifGiveUp++; i++; soSet(id, function (s) { s.b[h] = 'IN_FLIGHT2'; }); return next();   /* the second IN_FLIGHT: this character is left (manual stays) */
        }
        i++; soSet(id, function (s) { s.b[h] = String(code).slice(0, 32); });
        if (x && x.ok && EF_OK[code]) { if (code === 'EXISTS') stats.exists++; else stats.created++; refreshPortraits(); return next(); }
        stats.efFail++;
        if (EF_STOP[code]) return endB(code, holdOf(code, x));
        next();   /* 422 imgsafe / PROFILE_NOT_ENGLISH / CANDIDATES_PENDING / IN_FLIGHT (retry off) / IN_PROGRESS / LOST_RACE / UNGROUNDED …: this character only */
      });
    };
    var next = function () {
      if (i >= todo.length) return endB(null);
      if (!same(id, a0)) return endB('RECHECK');
      var c = todo[i], h = hk(c.id);
      var cur = (suggest(c.id) || {}).current || {};
      if (!cur.appearance) { i++; soSet(id, function (s) { s.b[h] = 'NO_PROFILE'; }); return next(); }   /* the Worker would refuse (UNGROUNDED) — never send */
      var wait = Math.max(0, (X.leaseUntil || 0) - Date.now());   /* ★93-j: after an IN_FLIGHT, wait until the lease is likely free (0 otherwise = as before) */
      if (wait) note({ kind: 'IF_WAIT', ms: wait });
      setTimeout(function () {
        if (!same(id, a0)) return endB('RECHECK');
        waitFor(quiet, WAIT_MS * 6, function (q) {
          if (!q) { X.bDone = false; return finish('B_NOT_QUIET'); }   /* nothing sent; the loop tries again later on this page */
          if (!same(id, a0)) return endB('RECHECK');
          var b0 = (soOf(id) || { b: {} }).b[h];
          if (b0 !== 'IN_FLIGHT') return send(c, h, false);
          /* ★93-j: the retry — first look whether the character got a picture meanwhile (the other request may have been for this same character) */
          pointers(id, function (by) {
            if (!same(id, a0)) return endB('RECHECK');
            if (by === null) { i++; soSet(id, function (s) { s.b[h] = 'IF_READ_FAIL'; }); stats.efFail++; return endB('READ_FAIL'); }   /* = READ_FAIL of ensureFirst: stop, nothing sent */
            if (by[c.id]) { i++; stats.ifFilled++; soSet(id, function (s) { s.b[h] = 'FILLED'; }); note({ kind: 'IF_FILLED' }); refreshPortraits(); return next(); }   /* nothing sent */
            send(c, h, true);
          });
        });
      }, wait);
    };
    note({ kind: 'B_START', n: todo.length, try: so.bt });
    next();
  }

  /* ---------- B: the one reload after a profile write (fix733 TYPE A) ---------- */
  function toast(t) {
    try { var d = document.createElement('div'); d.setAttribute('data-av2-ui', 'starticon-toast');
      d.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483647;max-width:92vw;background:#222;color:#eee;border:1px solid #806040;border-radius:8px;padding:8px 12px;font-size:12px;line-height:1.6';
      d.textContent = t; (document.body || document.documentElement).appendChild(d); } catch (e) {}
  }
  /* ★93-k（Owner 実測 2026-11-09）: 段 A のあと「1 回だけの再読み込み」を待つ間に Owner が 👥 キャラ一覧を開いていたため、MODAL で止まり絵が付かなかった。
     キャラ一覧を「見ているだけ」（文字の入った欄・確認欄・ピッカー・ほかのダイアログが無い）なら、再読み込みへ進む
     （再読み込みは fix733 TYPE A のため省けない＝外見を書いたこのページでは物語の保存が止まっている。手動の「この外見で作る」も一覧を開いたまま読み直す＝portrait.js afterSidePort）。
     読み直した後は同じ一覧を 1 回だけ開き直す（同じ物語・2 分以内）。入力中の文字・下書き・生成中・操作の直後（4 秒）は今までどおり待つ。
     待っている間（一覧の中で編集中・ほかの画面）は「キャラ一覧を閉じると絵の準備を続けます」を 1 回出す。kill: v292DfixSTARTICONListOff='1'（= 93-j の待ち方） */
  var waitToast = null, blockedSince = 0;
  function toastWait(t) {
    if (waitToast) return; stats.listWaitToast++; note({ kind: 'LIST_WAIT_TOAST' });
    try { var d = document.createElement('div'); d.setAttribute('data-av2-ui', 'starticon-wait');
      d.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483647;max-width:92vw;background:#222;color:#eee;border:1px solid #806040;border-radius:8px;padding:8px 12px;font-size:12px;line-height:1.6;pointer-events:none';
      d.textContent = t; (document.body || document.documentElement).appendChild(d); waitToast = d;
      setTimeout(function () { try { if (d.parentNode) d.parentNode.removeChild(d); } catch (e) {} }, 9000); } catch (e) {}
  }
  function watchReload() {
    if (!X.needReload || X.reloaded || X.busy) return;
    var lo = listOn(), why = inFlight() ? 'INFLIGHT' : (screenBusy(lo) || (lc1Busy() ? 'LC1' : null));
    if (why) {
      if (lo && why === 'MODAL') { if (!blockedSince) blockedSince = Date.now(); if (Date.now() - blockedSince > 3000) toastWait(document.querySelector('.v292Dfix145-modal') ? 'キャラ一覧を閉じると絵の準備を続けます' : '開いている画面を閉じると絵の準備を続けます'); }
      else if (why !== 'RECENT_ACTION') blockedSince = 0;
      return;
    }
    var listOpen = lo && !!document.querySelector('.v292Dfix145-modal');
    X.reloaded = true; stats.reloads++; if (listOpen) stats.listReload++; note({ kind: 'RELOAD', list: listOpen });
    if (listOpen) { try { root.sessionStorage.setItem(REOPENK, JSON.stringify({ v: 1, s: sid(), t: Date.now() })); } catch (e) {} }
    try { if (waitToast && waitToast.parentNode) waitToast.parentNode.removeChild(waitToast); } catch (e) {}
    toast('キャラの絵を用意するため、1 回だけ再読み込みします');
    setTimeout(function () { try { location.reload(); } catch (e) {} }, 1200);
  }
  /* ★93-k: 再読み込みの前にキャラ一覧が開いていたら、読み直した後に同じ物語なら 1 回だけ開き直す（2 分以内・印は読んだら消す・通信 0） */
  /* 印は開き直したときに消す（読み込み直後に消すと、続けて起きる既存の読み直し＝canonical の再読込で失われる。実測 2026-11-09） */
  function dropReopen() { reopen = null; try { root.sessionStorage.removeItem(REOPENK); } catch (e) {} }
  var reopen = (function () { try { var v = root.sessionStorage.getItem(REOPENK); if (!v) return null; var o = JSON.parse(v);
    if (o && o.v === 1 && o.s && Date.now() - (+o.t || 0) < 120000) return o; root.sessionStorage.removeItem(REOPENK); return null; } catch (e) { return null; } })();
  function watchReopen() {
    if (!reopen) return;
    if (!listOn() || Date.now() - reopen.t > 120000) return dropReopen();
    var id = sid(); if (!id) return; if (id !== reopen.s) return dropReopen();
    if (document.querySelector('.v292Dfix145-modal')) return dropReopen();   /* もう開いている（ほかの部品・本人） */
    if (chars().length === 0 || !doc2() || !ready(id)) return;   /* 段 B と同じ「落ち着いた」ページになってから */
    var cl = root.__charlist; if (!cl || typeof cl.open !== 'function') return;
    dropReopen(); stats.listReopen++; note({ kind: 'LIST_REOPEN' });
    try { cl.open(); } catch (e) {}
  }

  /* ---------- loop ---------- */
  function tick() {
    try {
      if (killed()) return;
      watchReload();
      try { watchReopen(); } catch (eR) {}
      var g = gateWhy(); X.why = g || 'on'; if (g) return;
      var id = sid();
      if (X.story !== id) { X.story = id; X.firstTurns = null; X.okSince = 0; X.pageStop = null; X.bDone = false; X.bCounted = false; }
      if (X.busy || X.needReload || X.pageStop) return;
      var S = state(); if (!S || !Array.isArray(S.turns)) return;
      if (X.firstTurns === null) X.firstTurns = S.turns.length;
      var so = soOf(id);
      if (!so) {
        if (X.firstTurns > CAP.maxTurns) { X.pageStop = 'NOT_START'; return; }   /* an older story (opened with more turns): never automatic */
        if (!isNewStory(id)) { X.pageStop = 'NOT_NEW'; return; }   /* ★STARTICON2 (GPT #127-RI ①): created more than 6 h ago / id without a time → opening it never starts anything */
        if (rec().starts >= capDayStarts()) { X.pageStop = 'DAY_CAP'; return; }   /* ★LIM1: the account's own value (Infinity = no cap); no row = 5 */
        claimB37(id);
      } else if (so.p === 'plan' && Date.now() - (so.at || 0) > 60000) {   /* a page closed in the middle of A: continue with the profiles that were written (never re-draft) */
        soSet(id, function (s) { s.p = 'img'; s.why = 'PLAN_RESUMED'; }); return;
      } else if (so.p !== 'img') return;   /* done / stop (or a plan another tab is running right now) */
      if (Date.now() - X.t0 > AUTO_MAX_MS) { X.pageStop = 'TIMEOUT'; return; }
      if (!ready(id) || chars().length === 0) { X.okSince = 0; return; }
      if (!X.okSince) { X.okSince = Date.now(); return; }
      if (Date.now() - X.okSince < STABLE_MS) return;
      if (!so) phaseA(id); else phaseB(id);
    } catch (e) { note({ kind: 'TICK_THREW', e: String(e).slice(0, 80) }); X.busy = false; }
  }
  var isIndex = /\/index(\.html)?$/.test(location.pathname) || location.pathname === '/';
  var isNew = (function () { try { return new URLSearchParams(location.search).get('new') === '1'; } catch (e) { return false; } })();   /* = B37: the first open(s) after ▶ start */
  function boot() { if (killed() || !isIndex) return; setInterval(tick, POLL_MS); tick(); }

  root.__v292DfixSTARTICON = {
    ver: VER,
    status: function () { var id = sid(); var so = id ? soOf(id) : null; var r = rec();
      return { ver: VER, killed: killed(), gate: gateWhy() || 'on', story: id, firstTurns: X.firstTurns, busy: X.busy, pageStop: X.pageStop, needReload: X.needReload, reloaded: X.reloaded,
        rec: so ? JSON.parse(JSON.stringify(so)) : null, day: { day: r.day, starts: r.starts }, last: X.last, stats: JSON.parse(JSON.stringify(stats)), hold: ssGet(HOLDK), log: LOG.slice(-40),
        retry: { on: retryOn(), leaseWaitMs: Math.max(0, (X.leaseUntil || 0) - Date.now()) },   /* ★93-j */
        list: { on: listOn(), reopenPending: !!reopen, screen: screenBusy(listOn()) },   /* ★93-k */
        caps: (function () { var sc = storyCap(), d = capDayStarts(); return { dayStarts: d === Infinity ? -1 : d, hero: sc.hero, npcs: sc.npcs === Infinity ? -1 : sc.npcs, src: sc.src, lim: (root.__v292DfixADMF1 && typeof root.__v292DfixADMF1.limDecide === 'function') ? root.__v292DfixADMF1.limDecide('starticon_day_stories').why : 'no-admf1' }; })() }; },   /* ★LIM1 */
    __t: { hk: hk, bornMs: bornMs, isNewStory: isNewStory, storyCap: storyCap, capDayStarts: capDayStarts }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof window !== 'undefined' ? window : this);
