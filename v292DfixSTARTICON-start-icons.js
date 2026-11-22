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
 * ■★ICONFIX2（laneICONFIX2・2026-11-14・GPT #127-TN icons (2)(3)・LOCAL）
 *   b) 外見の案を「変えてはいけない事実」（性別・種類・体の作り・材質・持ち物/補助具・役割・体格）と照らす（LC1prop.enforceFacts）。落ちた事実は説明文の句を戻し、
 *      性別の無い人物の性別の案は外す。戻せない（400 字を超える）ときはそのキャラだけ作らない（PROPOSE_FACTS_*・手動は残る）。kill: v292DfixICONFIX2bOff='1'。
 *   c) 段 B の結果をキャラごとに独立させる: 結果不明（OUTCOME_UNKNOWN・アカウント単位の断り CUSTOMER_IMG_* などは除く）と GENERATION_FAILED は
 *      そのキャラだけ保留して次のキャラへ進む（同じアカウントの札が空く頃まで待ってから＝IN_FLIGHT と同じ待ち）。送り直しはしない（費用の二重なし）。
 *      まず札が空く頃（20〜40 秒後）に同じキャラの結果を portrait.list で読み（読むだけ）、絵が付いていれば採用（ADOPTED）。無ければ保留のまま次のキャラへ。
 *      最後にもう 1 回（結果から 120 秒後）だけ読み直し、まだ無ければ UNKNOWN_HELD（手動の「結果を確かめる」は残る）。
 *      2 人続けて結果不明／生成失敗なら、そこで止める（障害のときに送り続けない）。上限・混雑・利用記録・403/501・READ_FAIL などは今までどおり全体を止める。
 *      kill: v292DfixICONFIX2cOff='1' → 今までどおり（最初の結果不明で止まる）。
 *   t) 段ごとの時間（下書き・案・外見の登録・絵・表示）を status().timing に出す（数字だけ・この端末の記録に最新 5 物語分）。kill: v292DfixICONFIX2tOff='1'。
 * ■診断: window.__v292DfixSTARTICON.status()
 * ===================================================================== */
(function (root) {
  'use strict';
  if (typeof window === 'undefined' || root.__v292DfixSTARTICON) return;
  var VER = 'starticon-d-20261109-ifretry-listopen+lim1+fx2+fx3';   /* ★93-k: キャラ一覧を開いたままでも 1 回の再読み込みへ進む・一覧の行の読み直し */
  var KILL = 'v292DfixSTARTICONOff', NOAI = 'v292DfixSTARTICONNoAI', LSK = 'v292DfixSTARTICON_v1', HOLDK = 'v292DfixSTARTICON_hold', RETRY_OFF = 'v292DfixSTARTICONRetryOff';   /* ★93-j */
  var LIST_OFF = 'v292DfixSTARTICONListOff', REOPENK = 'v292DfixSTARTICON_reopen';   /* ★93-k: kill（= 93-j と同じ再読み込みの待ち方）・再読み込みの後に一覧を開き直す印（sessionStorage・このタブだけ） */
  var IF_WAIT_MS = 20000, IF_SPAN_MS = 20000;   /* ★93-j: IN_FLIGHT の後に待つ時間 = 20 秒 + 0〜20 秒（Worker の口座の札 MX_LEASE_MS = 300 秒より十分短い・生成 1 枚より長い） */
  var CAP = { npcs: 3, maxTurns: 2, dayStarts: 5, bTries: 2, newMs: 6 * 3600 * 1000 };
  var FX2B_OFF = 'v292DfixICONFIX2bOff', FX2C_OFF = 'v292DfixICONFIX2cOff', FX2T_OFF = 'v292DfixICONFIX2tOff';   /* ★ICONFIX2 */
  var UNK_CHECK_MS = [120000], UNK_SERIAL_MAX = 2, TM_KEEP = 5;   /* ★ICONFIX2 c: 保留キャラの最後の読み直し（結果から 120 秒）／続けて 2 回で止める ★t: 時間の記録は最新 5 物語 */
  var POLL_MS = 1500, STABLE_MS = 3000, AUTO_MAX_MS = 240000, WAIT_MS = 20000, CLEAN_MS = 45000;
  /* ★BILL1c（laneAUTOICON2 r3・2026-11-16・GPT #127-VB 3 と「復旧・再試行再開の経路を残す」。既定 ON・kill: localStorage v292DfixBILL1cOff='1' で今まで（新しいコードを特別扱いしない））:
     Worker が画像サービスの認証エラー（PROVIDER_AUTH_FAILED）・残高切れ（PROVIDER_BALANCE_EXHAUSTED。HTTP 502・本文の error の欄・retry:false。402 の保留中は held:true）を返したら、その物語では 10 分、
     STARTICON・MIDICON・PROMOICON1 の「自動の」要求だけを打たない。抑止はこのタブのメモリだけ（保存しない）＝ページの読み直しで解ける。手で押す「絵を作る」「再生成」はここを通らない（止めない）。
     知らせはこのページで 1 回だけ。旧 Worker はこのコードを返さない → 何も変わらない。同じ部品を av2-data・MIDICON・STARTICON が持ち、先に読み込んだものが window.__v292DfixBILL1 を作る。 */
  /* ★BILL1c2（GPT #127-VF 2・2026-11-16）: 知らせを確実に 1 回。一時の帯（6 秒で消えていた）をやめ、閉じるまで残る帯（画面の上・前面）にする。
     出せたときだけ「出した」と数える（体が無ければ読み込みの後にもう一度）。文言は端末が持つ（Worker の message は使わない・残高不足や自動の復旧を断定しない）。
     抑止が解けたら（10 分・clear）帯も消す。抑止は今までどおりこのタブのメモリだけ（読み直しで解ける）・手で押す操作は止めない。管理用に最後のコードと held を status() に残す。 */
  if (!root.__v292DfixBILL1 || !(root.__v292DfixBILL1.v >= 3)) root.__v292DfixBILL1 = (function () {
    var HOLD_MS = 10 * 60 * 1000, CODES = { PROVIDER_AUTH_FAILED: 1, PROVIDER_BALANCE_EXHAUSTED: 1 }, ST = {}, noted = false, el = null, pend = null, tries = 0, last = null, shownN = 0, closed = false;   /* ST: 物語 ID → { c, at }（メモリだけ） */
    var TXT = { PROVIDER_BALANCE_EXHAUSTED: '画像サービス側の請求・利用枠の問題で、いまはキャラの絵を作れません。時間をおいてもう一度お試しください。物語はそのまま続けられます。',
      PROVIDER_AUTH_FAILED: '画像サービスの認証の問題で、いまはキャラの絵を作れません。時間をおいてもう一度お試しください。物語はそのまま続けられます。' };
    function on() { try { return root.localStorage.getItem('v292DfixBILL1cOff') !== '1'; } catch (e) { return true; } }
    function isCode(c) { return on() && !!CODES[c]; }
    function mark(id, code, det) { if (!id || !isCode(code)) return; ST[String(id)] = { c: String(code).slice(0, 32), at: Date.now() }; det = det || {}; last = { c: String(code).slice(0, 32), at: Date.now(), held: det.held === true, http: typeof det.http === 'number' ? det.http : null, by: String(det.by || '').slice(0, 12) }; }
    function anyOn() { for (var k in ST) { if (Date.now() - ST[k].at < HOLD_MS) return true; } return false; }
    function unshow() { try { if (el && el.parentNode) el.parentNode.removeChild(el); } catch (e) {} el = null; }
    function stopped(id) { if (!on() || !id) return null; var x = ST[String(id)]; if (!x) return null; if (!(Date.now() - x.at < HOLD_MS)) { delete ST[String(id)]; if (!anyOn()) unshow(); return null; } return x.c; }
    function clear(id) { if (id) delete ST[String(id)]; else ST = {}; if (!anyOn()) unshow(); return true; }   /* 解除の口（補充の後に呼べる。読み直しでも解ける） */
    function show(code) {
      var d = root.document; if (!d || typeof d.createElement !== 'function') return false; var host = d.body || d.documentElement; if (!host || typeof host.appendChild !== 'function') return false;
      var b = d.createElement('div'); try { b.setAttribute('data-av2-ui', 'bill1-notice'); b.setAttribute('role', 'status'); } catch (e) {}
      b.style.cssText = 'position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:2147482000;box-sizing:border-box;width:max-content;max-width:min(560px,calc(100vw - 24px));background:#2b2620;color:#f4ece0;border:1px solid #a07840;border-radius:10px;padding:10px 12px;font-size:13px;line-height:1.6;display:flex;gap:10px;align-items:flex-start;box-shadow:0 4px 16px rgba(0,0,0,.45)';
      var t = d.createElement('span'); t.textContent = TXT[code] || TXT.PROVIDER_BALANCE_EXHAUSTED; b.appendChild(t);
      var x = d.createElement('button'); x.textContent = '閉じる'; try { x.setAttribute('type', 'button'); } catch (e) {}
      x.style.cssText = 'flex:none;background:#4a4030;color:#f4ece0;border:1px solid #a07840;border-radius:6px;padding:2px 10px;font-size:12px;cursor:pointer';
      x.onclick = function () { closed = true; unshow(); }; b.appendChild(x);
      host.appendChild(b); el = b; return true; }
    function notice(code) {   /* このページで 1 回。出せたときだけ noted */
      try { if (noted || !on()) return false; code = CODES[code] ? code : (last && last.c) || 'PROVIDER_BALANCE_EXHAUSTED';
        if (show(code)) { noted = true; shownN++; return true; }
        if (!pend && tries < 20) { pend = code; tries++; var d = root.document, again = function () { var c = pend; pend = null; notice(c); };
          try { if (d && typeof d.addEventListener === 'function' && d.readyState === 'loading') d.addEventListener('DOMContentLoaded', again); else root.setTimeout(again, 500); } catch (e) {} }
        return false; } catch (e) { return false; } }
    function status() { return { v: 3, on: on(), holdMs: HOLD_MS, stories: Object.keys(ST).length, noted: noted, shown: shownN, visible: !!(el && el.parentNode), closed: closed, last: last }; }
    return { v: 3, HOLD_MS: HOLD_MS, CODES: CODES, TXT: TXT, on: on, isCode: isCode, mark: mark, stopped: stopped, clear: clear, notice: notice, noted: function () { return noted; }, status: status };
  })();
  function BILL() { return root.__v292DfixBILL1 || null; }
  function lsGet(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { root.localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function ssGet(k) { try { return root.sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { root.sessionStorage.setItem(k, v); } catch (e) {} }
  var LOG = []; function note(o) { try { o.t = Date.now(); o.inFlight = inFlight(); LOG.push(o); if (LOG.length > 120) LOG.shift(); } catch (e) {} }
  var stats = { plans: 0, proposals: 0, direct: 0, sets: 0, setFail: 0, ef: 0, created: 0, exists: 0, efFail: 0, reloads: 0, skipped: 0, sentWhileInFlight: 0, inflight: 0, ifRetry: 0, ifFilled: 0, ifGiveUp: 0, listReload: 0, listWaitToast: 0, listReopen: 0, listRefresh: 0,
    factsOk: 0, factsRepaired: 0, factsSex: 0, factsFatal: 0, unkHeld: 0, unkAdopted: 0, unkContinue: 0, unkSerialStop: 0 };   /* ★93-j: +inflight / ifRetry / ifFilled / ifGiveUp ★93-k: +list* ★ICONFIX2: +facts* / unk* */
  function fx2bOn() { var P = root.__v292DfixLC1prop; return lsGet(FX2B_OFF) !== '1' && !!(P && typeof P.enforceFacts === 'function'); }
  function fx3On() { var P = root.__v292DfixLC1prop; return lsGet('v292DfixICONFIX3Off') !== '1' && lsGet('v292DfixICONFIX3NoDescOff') !== '1' && !!(P && typeof P.fx3Fill === 'function'); }   /* ★ICONFIX3: 説明文なしの自動（個別の kill = v292DfixICONFIX3NoDescOff） */
  function fx2cOn() { return lsGet(FX2C_OFF) !== '1'; }
  function tmOn() { return lsGet(FX2T_OFF) !== '1'; }

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
  function vaultHidden(id) { try { var G = root.__v292DfixVAULTGATE2; if (G && typeof G.hidden === 'function') { var hv = G.hidden(id); if (hv === false) VGX[id] = 'visible'; return hv !== false; } }   /* r2: remember 'visible' (vgAuth / vgSticky) */ catch (e) { return true; } try { if (root.localStorage.getItem('v292DfixVAULTGATE2Off') !== '1') return true; } catch (e) { return true; }   /* ★VAULTGATE2 r2: kill していないのに部品が無い = 隠した物語かもしれない（止める） */ try { var V = root.__v292Dfix889; if (!V || typeof V.isHidden !== 'function') return true; return !!V.isHidden(id); } catch (e) { return true; } }   /* ★VAULTGATE2: vault2 と fix889 の両方（1 か所） */   /* fail-closed */
  /* ★VICON1（GPT #127-WH・STARTICON）: 隠した物語でも、Vault が解錠中で、この物語が開かれているときだけ作る。
     判定（どれか 1 つでも欠ければ今までどおり作らない＝fail-closed）: fix889 が本物・状態 ready・解錠のしるし（unlocked）・扉が開いている（status().open）・その物語が隠した物語。
     既定は下の VICON1_DEFAULT_ON（1 か所）。kill: localStorage v292DfixVICON1Off='1'（隠した物語では今までどおり作らない）。VICON1_DEFAULT_ON を false にしたときは v292DfixVICON1On='1' の端末だけ。 */
  var VICON1_DEFAULT_ON = false, vstats = { gate: {}, skip: {}, draft: 0, conf: 0 };
  function viconOn() { return lsGet('v292DfixVICON1Off') !== '1' && (VICON1_DEFAULT_ON || lsGet('v292DfixVICON1On') === '1'); }
  function vaultOpenWhy(id) { try { var G = root.__v292DfixVAULTGATE2; if (G && typeof G.openWhy === 'function') return G.openWhy(id); } catch (e) { return 'THREW'; } try { if (root.localStorage.getItem('v292DfixVAULTGATE2Off') !== '1') return 'NO_VAULTGATE2'; } catch (e) { return 'NO_VAULTGATE2'; } try { var V = root.__v292Dfix889; if (!V || V.__real !== true || typeof V.isHidden !== 'function' || typeof V.state !== 'function' || typeof V.unlocked !== 'function' || typeof V.status !== 'function') return 'NO_VAULT';
      if (!V.isHidden(id)) return 'NOT_HIDDEN'; if (V.state() !== 'ready') return 'NOT_READY'; if (V.unlocked() !== true) return 'LOCKED'; var s = V.status(); if (!s || s.open !== true) return 'NOT_OPEN'; return ''; } catch (e) { return 'THREW'; } }
  function vcount(m, k) { k = String(k || 'X').slice(0, 32); m[k] = (m[k] || 0) + 1; }
  /* ★RESTYLE1: 隠した物語で動いてよいかの判定を 1 か所から出す（VICON1 の ON/OFF と、解錠中で扉が開いていること）。'' = 動いてよい */
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
  root.__v292DfixVaultOpenWhy = function (id) { try { if (!viconOn()) return 'VICON1_OFF'; return vaultOpenWhy(id); } catch (e) { return 'THREW'; } };
  /* 隠した物語の説明文に、外見以外の秘密が混ざっている印（GM・秘密・正体・隠している 等）があれば、その人物は自動では作らない（安全に分けられないとみなす） */
  var VICON1_SECRET = /(^|[^A-Za-z])(GM|ＧＭ)(?![A-Za-z])|専用】|【\s*(GM|ＧＭ)|裏設定|秘密|真相|本当は|本当の|ほんとう|正体|隠して|隠し事|隠れて|実は|ネタバレ|ネタばれ|誰にも|知らせない|知られて|明かす|明かさ|伏線|黒幕|犯人|偽名|本名|真の姿|裏では|表向き|化けて|化けた|見た目は人間|ふりを|振りを|偽って|偽り|内緒|極秘|機密|〔|〕|（GM|\(GM/;
  /* 近道の下書き（説明文の句そのまま）から、見た目の枠（年代・髪・瞳・服・顔や肌・体格＝LC1prop.slotsOf）に当たる句だけを残す。役割・肩書き・種類の語など枠に当たらない句は外す。
     残った句の見た目の種類（髪・瞳・服・顔）が 2 つ未満なら作らない（null） */
  /* ★VICON1 r2（独立レビュー）: 見た目の句でも、筋や時の印・関係の語・固有名らしい語を含む句、20 字を超える句は外へ出さない */
  var VICON1_PHRASE_NG = /第[0-9０-９一二三四五六七八九十百]+[章話幕部巻夜日]|後に|のちに|やがて|いずれ|かつて|以前|昔|[0-9０-９一二三四五六七八九十]+年前|失[うっいわ]|死|殺|亡|になる|となる|された|主人公|ヒロイン|プレイヤー|兄|弟|姉|妹|母|父|娘|息子|夫|妻|恋人|親友|師匠|弟子|と同じ|譲り|形見|そっくり|[「」『』"“”]|[一-龥々]{1,6}[会組団教社党家派軍]の|名札|名前|鍵|証|印|紋章|刻印|[A-Za-z]{3,}/;
/* ===== VSAFE1-BEGIN (MXVAULT1 r3・GPT #127-WL 3 + review r2) — the SAME text is in the client (STARTICON) and in the Worker; tests compare both. =====
   v2 = an ALLOW-list: only the words of a look vocabulary may leave (colours, hair, eyes, skin, face, body, AGE words, clothes and small things, patterns,
   scars and marks, degree words, particles and endings). Hidden (Vault) stories only: what may leave for the translator / imgsafe / the image provider.
   phrase(x): one look phrase → the rewritten phrase, or '' (dropped).
     0. NFKC. A phrase of more than 20 chars (as written) or with a secret mark (VICON1_SECRET) is dropped. After step 1, a plot / time / relation / name-like rule (VICON1_PHRASE_NG, with the
        age words masked so that 妹系・お姉さん・娘 stay, and 印象 allowed) or a rank / role / plot word (ROLE) → the whole phrase is dropped.
     1. text in （）／() and 「」『』 is removed; rewrite: 吸血鬼の牙 → 鋭く長い犬歯, 悪魔の角 → 角, 天使の翼 → 白い翼, 天使のような → 柔らかな, 九尾 → 九本の尾,
        クロヘビ → 黒い蛇の模様, 変装用の → '', 付け髭 → 髭.
     2. the phrase is cut into vocabulary words (longest match). A "word" of the text (a run without hiragana) or a run of hiragana that has ANY character
        outside the vocabulary is dropped as a whole, whatever its script (hiragana / kanji / katakana / latin / full or half width): くろへび会・ひばり学園・
        健一・ＮＥＲＶ・ｸﾛﾍﾋﾞ・竜人・神 … never leave. A particle / ending right after a dropped word is dropped too; particles at the end are cut.
     3. if a look word or an AGE word is left, the rest is kept; otherwise the phrase is dropped.
   Age words (女子高校生・中学生・十二歳・幼い・少女・ランドセル …) are vocabulary and are never cut (the minor check of imgsafe must see them). */
var VSAFE1 = (function () {
  var SECRET = /(^|[^A-Za-z])(GM|ＧＭ)(?![A-Za-z])|専用】|【\s*(GM|ＧＭ)|裏設定|秘密|真相|本当は|本当の|ほんとう|正体|隠して|隠し事|隠れて|実は|ネタバレ|ネタばれ|誰にも|知らせない|知られて|明かす|明かさ|伏線|黒幕|犯人|偽名|本名|真の姿|裏では|表向き|化けて|化けた|見た目は人間|ふりを|振りを|偽って|偽り|内緒|極秘|機密|〔|〕|（GM|\(GM/;
  var NG = /第[0-9０-９一二三四五六七八九十百]+[章話幕部巻夜日]|後に|のちに|やがて|いずれ|かつて|以前|昔|[0-9０-９一二三四五六七八九十]+年前|失[うっいわ]|死|殺|亡|になる|となる|された|主人公|ヒロイン|プレイヤー|兄|弟|姉|妹|母|父|娘|息子|夫|妻|恋人|親友|師匠|弟子|と同じ|譲り|形見|そっくり|[「」『』"“”]|[一-龥々]{1,6}[会組団教社党家派軍]の|名札|名前|鍵|証|印(?!象)|紋章|刻印|[A-Za-z]{3,}/;
  var ROLE = /として|追われ|狙われ|幹部|首領|頭目|団員|組員|構成員|会員|信者|教祖|部下|手下|ボス|リーダー|スパイ|工作員|刺客|暗殺者|脱走|逃亡|指名手配|正体|変装/;
  var V = {}, MAXL = 1;
  [['c', 'cm kg あご あごひげ あざ うっすら えくぼ えんじ おかっぱ おさげ おでこ お団子 かけた かなり かばん かぶった かわいい かんざし がっしり きれい くせ毛 くま さらさら しっぽ しわ すこし すらり そばかす たれ目 つけた つやつや つややか つり目 とても のぞく ぱっつん ひげ ふっくら ふわふわ ほお ほくろ ほっそり ぼさぼさ ぼろぼろ ぽっちゃり まつげ まなざし まゆ もじゃもじゃ もみあげ やけど やせた やや ゆるい ゆるく よれよれ アイシャドウ アイパッチ アイボリー アホ毛 アンクレット イヤホン イヤリング インナー ウィッグ ウェーブ ウルフ ウール エプロン オッドアイ オレンジ オールバック カチューシャ カット カラー カーキ カーディガン ガウン ガーター キャップ キャミソール クリーム グリーン グレー グローブ ケープ コルセット コート ゴシック ゴム ゴーグル ゴールド サイドテール サングラス サンダル シャツ シュシュ ショート ショートパンツ シルク シルバー ジャケット ジャン ジャンパー ジャージ ジレ ジーンズ スカジャン スカート スカーフ ストッキング ストライプ ストレート ストール スニーカー スーツ ズボン セミロング センター センチ セーター セーラー ソックス タイツ タトゥー タンクトップ タートルネック ターバン ダウン チェック チェーン チャイナ チュニック チョーカー ツインテール ティアラ デニム トレンチ ドット ドレス ドレッド ナース ニット ニーソックス ニーハイ ネイビー ネイル ネクタイ ネグリジェ ネックレス ハイソックス ハイネック ハイライト ハット ハーネス ハーフアップ バッジ バンダナ パジャマ パステル パンク パンツ パンプス パーカー パート パーマ ヒール ピアス ピンク ファー フリル フリース フレーム フード ブラウス ブラウン ブラック ブルゾン ブルー ブレザー ブレスレット ブロンド ブローチ ブーツ プラチナ ヘア ヘアバンド ヘアピン ヘアー ヘッドドレス ヘッドフォン ヘッドホン ベスト ベルト ベレー ベレー帽 ベージュ ベール ペンダント ホワイト ボタン ボブ ボーダー ポケット ポニーテール ポンチョ マスク マニキュア マフラー マント ミニ ミニスカート ミント メイド メガネ メッシュ モノクロ モヒカン ラベンダー ランドセル リボン ルージュ レギンス レザー レッド レース ロリータ ロング ロングスカート ローファー ローブ ワイシャツ ワイン ワッペン ワンピース ヴェール 一つ結び 一重 三つ編み 三白眼 上 上品 上着 上衣 下 下着 下駄 不精 両 両手 両方 両目 両腕 両足 中性的 中肉中背 丸い 丸く 丸刈り 丸眼鏡 丸顔 乱れた 二つ結び 二の腕 二重 亜麻色 付けた 仮面 伸ばした 伸びた 低い 体 体つき 体型 体操服 体格 作務衣 作業服 作業着 修道服 傘 傷 傷痕 傷跡 僧衣 優しい 優しげ 先 光る 光沢 兎 兎耳 兜 入れ墨 全身 八重歯 冷たい 凛々しい 凛とした 刀 切り傷 切れ長 刈った 刈り上げ 制帽 制服 刺し傷 刺繍 刺青 剃った 前 前掛け 前開き 前髪 剣 割烹着 包帯 化粧 半分 半袖 半透明 印象 印象的 卵形 厚い 口 口元 口紅 口髭 古い 古びた 古傷 可愛い 可憐 右 右手 右腕 右足 吊り目 和服 唇 喉 喪服 団子 地味 地毛 坊主 坊主頭 垂れた 垂れ目 型 墨 外套 外衣 大きい 大きく 大きな 大柄 天然パーマ 太い 太く 太もも 妖艶 姿 姿勢 学帽 学生服 宝石 寝癖 寝間着 小さい 小さく 小さな 小麦色 少し 尻尾 尾 届く 履いた 山吹 左 左手 左腕 左足 巫女服 巫女装束 巻いた 巻き毛 布 帯 帽 帽子 広い 強面 形 後ろ 後ろ髪 微笑み 扇子 手 手袋 手首 持った 指 指先 指輪 掛けた 整った 新しい 日 日傘 日焼け 明 明るい 普段着 暗 暗い 服 木綿 本 朱 杖 束ね 束ねた 柄 染み 染めた 柔らかい 柔らかな 柔和 栗 栗色 根元 格子 桃 桃色 桃髪 桜色 模様 横 横髪 橙 歯 毛 毛並み 毛先 毛皮 毛糸 水玉 水着 水色 汚れ 汚れた 法衣 法被 泣きぼくろ 洋服 派手 浅い 浴衣 涙 淡 淡い 深い 深緑 清楚 漆黒 濃 濃い 濃紺 濡れた 火傷 灰 灰白 灰色 灰髪 無地 無精 無精ひげ 無精髭 無表情 焼けた 煙管 熊 爪 片 片方 片目 牙 犬 犬歯 犬耳 狐 狐耳 狭い 狸 狼 猫 猫耳 猫背 獣耳 琥珀 瑠璃 甚平 生えた 生やし 生やした 生成り 甲冑 痕 痣 痩せ 痩せた 痩身 癖 癖毛 白 白っぽい 白目 白色 白衣 白銀 白髪 白髪交じり 皮 皺 目 目つき 目元 目深 目立つ 目鼻立ち 眉 眉毛 真っ白 真っ赤 真っ青 真っ黒 真珠 真紅 眠そう 眼 眼つき 眼差し 眼帯 眼鏡 着 着た 着て 着物 睫毛 瞳 瞳孔 短い 短く 短め 短髪 石 破れた 硬い 碧 碧眼 礼服 私服 穏やか 空色 立派 端正 笑顔 筋肉 筋肉質 簪 精悍 紅 紋 紋様 紐 純白 素朴 素肌 紫 紫色 紫髪 細い 細く 細目 細身 細面 紺 紺色 結い 結った 結び 結んだ 絹 綺麗 緑 緑色 緑髪 編み込み 縁 縞 美しい 美人 美形 群青 羽 羽根 羽織 羽織った 翠 翡翠 翼 耳 耳飾り 肌 肌色 肩 肩幅 肩掛け 背 背丈 背中 背広 胸 胸元 胸当て 胸飾り 脚 腕 腕章 腕輪 腰 腰帯 腹 膝 臙脂 舌 色 色あせた 色白 色眼鏡 色褪せた 色黒 艶 艶やか 花 花柄 花飾り 茶 茶色 茶髪 草履 華やか 華奢 蒼 薄 薄い 薄紅 薄紫 薄茶 藍 虹彩 蛇 血色 衣 衣装 表情 袖 袖なし 被った 袴 装束 装飾 裾 褐 褐色 襟 襟元 襟巻き 覆面 覗く 角 豊か 象牙 赤 赤っぽい 赤色 赤銅 赤髪 足 足袋 跡 跳ねた 身体 身長 軍帽 軍服 軽い 輝く 輪郭 透き通った 透明 重い 金 金属 金色 金髪 鈴 銀 銀色 銀髪 銅 鋭い 鋭く 鎖 鎧 鎧姿 長い 長く 長め 長袖 長身 長靴 長髪 閉じた 開いた 開けた 険しい 隈 隻眼 青 青っぽい 青色 青髪 非常 面 面長 革 革靴 靴 靴下 鞄 頬 頬髭 頭 頭巾 頭髪 額 顎 顎髭 顔 顔つき 顔立ち 飾り 首 首元 首筋 首輪 首飾り 骨格 高い 髪 髪型 髪留め 髪紐 髪色 髪飾り 髭 鬼灯 鮮 鮮やか 鱗 鳥 鹿 麦わら帽子 麻 黄 黄ばんだ 黄色 黄金 黒 黒っぽい 黒子 黒縁 黒色 黒髪 鼻 鼻筋'], ['a', 'DC DK JC JK JS あどけない あどけなさ お兄さん お姉さん くらい ぐらい こども ショタ ロリ 中学 中学校 中学生 中年 中高生 乳児 代 低学年 児童 初老 前半 前後 十代 半ば 園児 大人 大人っぽい 大人びた 大学 大学生 女 女の子 女子 女子中学生 女子中高生 女子大学生 女子大生 女子小学生 女子高校生 女子高生 女性 妹系 姉系 娘 子ども 子供 学年 学生 小学 小学校 小学生 小柄 少女 少年 年少 年生 年配 年長 年頃 幼い 幼く 幼げ 幼さ 幼児 幼女 幼子 幼稚園児 後半 成人 才 新入生 未成年 歳 生徒 男 男の子 男子 男子中学生 男子小学生 男子高校生 男子高生 男性 程度 童顔 美少女 美少年 老いた 老人 老女 老婆 老年 若々しい 若い 若く 若者 赤ちゃん 赤子 青年 頃 高学年 高専生 高校 高校生 高齢'], ['p', ' から が と に は へ まで も や より を ・'], ['o', 'ある い いる かな がかった がち き く げ さ し した して している そう た だ だった っ っぽい っぽく て ている てる で な の ほど ぽい みたい め やか やかな ような ように らしい る れ 交じり 付き 付きの 位 入り 寄り 柄の 気味 混じり 状 的 的な 程 系 色の 調 風'], ['n', '0 1 2 3 4 5 6 7 8 9 〇 一 七 三 九 二 五 八 六 十 千 四 百']].forEach(function (e) { e[1].split(' ').forEach(function (w) { if (w) { V[w] = e[0]; if (w.length > MAXL) MAXL = w.length; } }); });
  var AGE_RX = new RegExp(Object.keys(V).filter(function (w) { return V[w] === 'a'; }).sort(function (a, b) { return b.length - a.length; }).join('|'), 'g');
  var DICT = [[/(?:吸血鬼|ヴァンパイア|バンパイア|きゅうけつき)の牙/g, '鋭く長い犬歯'], [/(?:悪魔|鬼|魔族|魔王)の角/g, '角'], [/天使の(?:翼|羽)/g, '白い翼'], [/天使のような/g, '柔らかな'],
    [/九尾(?:の狐)?/g, '九本の尾'], [/クロヘビ(?:の)?/g, '黒い蛇の模様の'], [/変装用の/g, ''], [/付け髭/g, '髭'], [/付けひげ/g, 'ひげ']];
  function isHira(ch) { return /[ぁ-ゖゝゞ]/.test(ch); }
  function phrase(x) {
    var s = String(x == null ? '' : x).normalize('NFKC').trim(); if (!s || s.length > 20) return '';
    if (SECRET.test(s)) return '';
    s = s.replace(/（[^）]*）|\([^)]*\)|「[^」]*」|『[^』]*』/g, '');
    for (var i = 0; i < DICT.length; i++) s = s.replace(/** @type {RegExp} */ (DICT[i][0]), /** @type {string} */ (DICT[i][1]));
    if (ROLE.test(s) || NG.test(s.replace(AGE_RX, '■'))) return '';
    s = s.trim(); var n = s.length; if (!n) return '';
    /* longest-match cut (fewest unknown characters first, then fewest words) */
    var bu = [0], bt = [0], bp = [-1], bw = ['']; for (var p = 1; p <= n; p++) { bu[p] = -1; bt[p] = 0; bp[p] = -1; bw[p] = ''; }
    var take = function (to, u, t, from, w) { if (bu[to] < 0 || u < bu[to] || (u === bu[to] && t < bt[to])) { bu[to] = u; bt[to] = t; bp[to] = from; bw[to] = w; } };
    for (var p0 = 0; p0 < n; p0++) { if (bu[p0] < 0) continue;
      take(p0 + 1, bu[p0] + 1, bt[p0] + 1, p0, '?');
      for (var L = 1; L <= MAXL && p0 + L <= n; L++) { var w = s.slice(p0, p0 + L); if (V[w]) take(p0 + L, bu[p0], bt[p0] + 1, p0, w); } }
    var toks = []; for (var e = n; e > 0; e = bp[e]) toks.unshift({ a: bp[e], b: e, w: s.slice(bp[e], e), c: bw[e] === '?' ? '?' : V[bw[e]] });
    /* segments: runs of hiragana, and runs of everything else except spaces; one unknown character spoils its whole segment */
    var seg = [], sid = -1; for (var k = 0; k < n; k++) { var ch = s[k], hk = /\s/.test(ch) ? 's' : isHira(ch) ? 'h' : 'x'; if (k === 0 || hk !== (/\s/.test(s[k - 1]) ? 's' : isHira(s[k - 1]) ? 'h' : 'x')) sid++; seg[k] = sid; }
    var bad = {}; toks.forEach(function (t) { if (t.c === '?') for (var k = t.a; k < t.b; k++) bad[seg[k]] = 1; });
    var out = [], prevKept = false, oRun = 0, look = false;
    toks.forEach(function (t) { var spoiled = false; for (var k = t.a; k < t.b; k++) if (bad[seg[k]]) spoiled = true;
      if (/^\s+$/.test(t.w)) { if (prevKept) out.push({ w: ' ', c: 'p' }); return; }
      if (spoiled || t.c === '?') { prevKept = false; oRun = 0; return; }
      if (t.c === 'p' || t.c === 'o') { if (!prevKept) return; if (t.c === 'o') { oRun += t.w.length; if (oRun > 5) { prevKept = false; return; } } out.push(t); return; }
      oRun = 0; prevKept = true; if (t.c === 'c' || t.c === 'a') look = true; out.push(t); });
    while (out.length && out[out.length - 1].c === 'p') out.pop();
    if (!look) return '';
    var r = out.map(function (t) { return t.w; }).join('').replace(/\s+/g, ' ').trim();
    if (!r || SECRET.test(r)) return '';
    return r;
  }
  function text(t) { var out = []; String(t == null ? '' : t).normalize('NFKC').split(/[、,。]/).forEach(function (x) { var p = phrase(x); if (p && out.indexOf(p) < 0) out.push(p); }); return out.join('、'); }
  function secret(t) { try { return SECRET.test(String(t == null ? '' : t).normalize('NFKC')); } catch (e) { return true; } }
  return { v: 2, phrase: phrase, text: text, secret: secret };
})();
/* ===== VSAFE1-END ===== */
  function viconVisual(draft) { try { var P = root.__v292DfixLC1prop; if (!draft || !P || typeof P.slotsOf !== 'function') return null;
      var keep = String(draft.text || '').split('、').map(function (x) { return VSAFE1.phrase(x); }).filter(function (x, i, a) { if (!x || a.indexOf(x) !== i) return false;   /* ★MXVAULT1 r3: VSAFE1 v2 (見た目の語彙だけを残す。NG・20 字は VSAFE1 の中で元の句に掛ける) */ var sl = P.slotsOf(x); for (var k in sl) if (sl[k]) return true; return false; });
      var sl2 = P.slotsOf(keep.join('、')), n = 0; ['hair', 'eyes', 'clothes', 'feature'].forEach(function (k) { if (sl2[k]) n++; }); if (n < 2) return null;
      return { text: keep.join('、'), gender: draft.gender || '' }; } catch (e) { return null; } }
  function viconUnsafe(desc) { var d = String(desc == null ? '' : desc).normalize('NFC'); if (VICON1_SECRET.test(d)) return 'SECRET_MARK';
    try { var P = root.__v292DfixLC1prop; if (P && typeof P.fx3Hidden === 'function' && P.fx3Hidden(d)) return 'HIDDEN_IDENTITY'; } catch (e) { return 'THREW'; } return ''; }
  /* ★MXVAULT1: MIDICON（隠した物語）にも同じ VSAFE1 を使わせる（1 か所）。STARTICON の通常の物語の動きは変えない（VICON1 は隠した物語だけ） */
  root.__v292DfixVICON1Clean = function (t) { try { return VSAFE1.text(t); } catch (e) { return ''; } };
  root.__v292DfixVICON1Clean.secret = function (t) { return VSAFE1.secret(t); };   /* secret marks only (for a name) */
  root.__v292DfixVICON1Clean.phrase = function (x) { try { return VSAFE1.phrase(x); } catch (e) { return ''; } };   /* tests: the client side of the shared table */
  function killed() { return lsGet(KILL) === '1' || lsGet('v292Dav2Off') === '1'; }
  /* ★HOLD2 1b（GPT #127-VZ・kill v292DfixHOLD2bOff）: この物語の昇格 journal がある間・fix756 の実行中は、外見の自動保存・絵の送信の開始・内部の自動再読込を待つ。
     待機が WAIT_MS（120 秒）を超えたら、このページでは再開しない（pageStop・自動再試行なし）。HOLD2 が無い・OFF → matWait は '' ＝土台と同じ */
  function h2Hold() { try { var H = root.__v292DfixHOLD2; return (H && typeof H.matWait === 'function') ? (H.matWait(sid()) || '') : ''; } catch (e) { return 'threw'; } }
  function h2Gate() { var w = h2Hold(), H = root.__v292DfixHOLD2; var bn = function (k) { try { if (H && typeof H.bNote === 'function') H.bNote(k); } catch (e) {} };
    if (!w) { if (X.h2Since) { X.h2Since = 0; bn('resume'); } return false; }
    if (!X.h2Since) { X.h2Since = Date.now(); bn('wait:' + w); }
    X.why = 'mat-wait';
    if (Date.now() - X.h2Since > ((H && H.WAIT_MS) || 120000) && X.pageStop !== 'MAT_WAIT_TIMEOUT') {
      var id0 = sid(); if (X.story !== id0) { X.story = id0; X.firstTurns = null; X.okSince = 0; X.bDone = false; X.bCounted = false; }   /* = tick's own story switch, so the stop is not cleared by it */
      X.pageStop = 'MAT_WAIT_TIMEOUT'; X.needReload = false; bn('timeout'); }
    return true; }
  function gateWhy() {
    if (killed()) return 'kill';
    if (!admfOn()) return 'flag-off';
    if (!loggedIn() || !acct()) return 'not-logged-in';
    if (ssGet(HOLDK)) return 'hold:' + ssGet(HOLDK);
    if (!UX() || !PR() || typeof PR().propose !== 'function') return 'iconux2-off';
    var a = A(); if (!a || typeof a.ensureFirst !== 'function' || typeof a.setProfile !== 'function' || typeof a.suggestAppearance !== 'function') return 'no-av2';
    if (!doc2()) return 'not-schema2';
    var id = sid(); if (!id) return 'no-story';
    if (vaultHidden(id)) { if (!viconOn()) return 'vault'; var vw = vaultOpenWhy(id); if (vw){ vcount(vstats.gate, vw); return 'vault'; } }   /* ★VICON1: 解錠中で開いている隠した物語だけ先へ */
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
  function same(id, a0) { return sid() === id && acct() === a0 && doc2() && (!vaultHidden(id) || vgSticky(id) || (viconOn() && !vaultOpenWhy(id))); }   /* ★VICON1: 途中で施錠されたら止める（隠していない物語では今までと同じ） */
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
    if (X.promo) return out.filter(function (c) { return !c.hero && hk(c.name) === X.promo.h; });   /* ★PROMOICON1: 昇格した 1 人だけ */
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
  function recSave(r) { var ks = Object.keys(r.st); if (ks.length > 40) ks.sort(function (a, b) { return (r.st[a].at || 0) - (r.st[b].at || 0); }).slice(0, ks.length - 40).forEach(function (k) { delete r.st[k]; });
    var tk = Object.keys(r.st).filter(function (k) { return r.st[k] && r.st[k].tm; }); if (tk.length > TM_KEEP) tk.sort(function (a, b) { return (r.st[a].at || 0) - (r.st[b].at || 0); }).slice(0, tk.length - TM_KEEP).forEach(function (k) { delete r.st[k].tm; });   /* ★ICONFIX2 t */
    lsSet(LSK, JSON.stringify(r)); }
  /* ★ICONFIX2 t: stage timing (numbers only; absolute times in 0.1 s units, durations in ms). so.tm = { a0, a1, rl, b0, b1, c: { <hash>: { x, w, p, ai, cw, s, i, code, cr, d } } } */
  function tmSet(id, fn) { if (!tmOn()) return; try { soSet(id, function (so) { so.tm = so.tm || { c: {} }; so.tm.c = so.tm.c || {}; fn(so.tm); }); } catch (e) {} }
  function tmC(id, h, fn) { tmSet(id, function (tm) { tm.c[h] = tm.c[h] || {}; fn(tm.c[h]); }); }
  function ds(t) { return Math.round(t / 100); }
  function rk(id) { return X.promo ? 'promo|' + id + '|' + X.promo.h : id; }   /* ★PROMOICON1: 昇格の 1 回は物語の始まりとは別の記録 */
  function soOf(id) { var r = rec(); return r.st[hk(rk(id))] || null; }
  function soSet(id, fn) { var r = rec(), k = hk(rk(id)); var so = r.st[k] || { p: null, at: Date.now(), t: [], a: {}, b: {} }; fn(so, r); so.at = Date.now(); r.st[k] = so; recSave(r); return so; }
  function claimB37(id) {   /* B37 の自動案内（LC1 では 👥 が勝手に開く）を「STARTICON が引き受けた」にする。B37 自身の 1 回の印と同じ形 */
    try { var k = 'v292DfixB37onb_' + id; if (lsGet(k)) return; if (lsGet('v292DfixB37bOff') === '1') return; lsSet(k, JSON.stringify({ v: 1, st: 'starticon', at: Date.now() })); note({ kind: 'B37_CLAIMED' }); } catch (e) {}
  }

  /* ---------- outcome tables ---------- */
  var SENSITIVE = { SENSITIVE_DESC: 1, YOUTH_BODY_DESC: 1, SENSITIVE_DRAFT: 1 };
  var SET_STOP = { LOCAL_NOT_SYNCED: 1, REBASE_REQUIRED: 1, READ_FAIL: 1, NOT_CANONICAL_ROW: 1, CONFLICT: 1, NOT_APPLIED: 1, READBACK_FAIL: 1, APPLIED_SERVER_MOVED: 1,
    MATERIALIZATION_PENDING: 1,   /* ★HOLD2 1b */
    SERVER_NOT_SCHEMA2: 1, AV2_OFF: 1, AV2_FLAG_OFF: 1, NOT_SCHEMA2_DOCUMENT: 1, REGISTRATION_PENDING: 1, NO_LOCAL_RECORD: 1 };   /* = LC1 / B37 STOP_SET (+2) */
  var EF_OK = { CREATED: 1, EXISTS: 1, CREATED_CONFIRMED: 1 };
  var EF_STOP = { BUDGET: 1, RATE_LIMITED: 1, LEDGER_UNHEALTHY: 1, ASSET_V2_UNAVAILABLE: 1, NOT_FOUND: 1, GENERATION_FAILED: 1, OUTCOME_UNKNOWN: 1, READ_FAIL: 1,
    AV2_OFF: 1, AV2_FLAG_OFF: 1, NOT_SCHEMA2_DOCUMENT: 1, REBASE_REQUIRED: 1, REGISTRATION_BLOCKED: 1 };
  var EF_HOLD = { ASSET_V2_UNAVAILABLE: 1, BUDGET: 1, RATE_LIMITED: 1 };   /* 403 / 501（公開許可の外・HOLD・停止中）・402（上限）・429（毎分 / お客さまの 1 日の枚数）→ このタブではもう試さない */
  var EF_ONE = { OUTCOME_UNKNOWN: 1, GENERATION_FAILED: 1 };   /* ★ICONFIX2 c: failures of ONE picture (not of the account / device / story) — held for that character only */
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
    X.busy = true; var a0 = acct(); X.aT0 = Date.now();   /* ★ICONFIX2 t */
    pointers(id, function (by) {
      if (!by) { X.pageStop = 'READ_FAIL'; return finish('A_READ_FAIL'); }   /* nothing sent; the next page load may try again */
      if (!same(id, a0)) return finish('A_RECHECK');
      /* targets: no picture on the server yet AND a draft is possible (confirmed appearance, or a description that is not sensitive) — then the cap (hero 1 + NPCs 3) */
      var vm = vaultHidden(id);   /* ★VICON1: ここまで来た隠した物語は、解錠中で開いている（gateWhy） */
      var cs = chars(), tg = [], npc = 0, skip = {}, sc = X.promo ? { hero: false, npcs: Math.min(1, storyCap().npcs), src: 'promo' } : storyCap(), xt = {};   /* ★PROMOICON1: 1 人だけ（r2: アカウントの LIM1 の値も通す）   /* ★LIM1 ★ICONFIX2 t: xt = extract ms per character */
      /* once per story across devices: only the device that created the story (URL new=1) starts with pictures already present; any other device /
         tab starts only when NO character of the story has a picture yet (otherwise another device — or the Owner — already did the start) */
      if (!X.promo && !isNew && cs.some(function (c) { return by[c.id]; })) { soSet(id, function (so) { so.p = 'done'; so.why = 'OTHER_DEVICE'; }); return finish('A_OTHER_DEVICE'); }
      cs.forEach(function (c) {
        if (by[c.id]) return;
        if (c.hero ? (!sc.hero || tg.some(function (t) { return t.hero; })) : npc >= sc.npcs) return;   /* ★LIM1: sc = { hero: true, npcs: 3 } without a row (as before) */
        var x0 = Date.now(), s = suggest(c.id), why = null, dc = null;
        if (!s) why = 'NO_ENTRY';
        else if (!(s.current && s.current.appearance)) {
          var desc = String(s.desc || '').trim();
          if (!desc && !fx3On()) why = 'SKIP_NO_DESC';   /* only from the description the story already has */
          else if (!desc) dc = { ok: false, why: 'NO_DESC' };   /* ★ICONFIX3: 説明文の無い登録キャラも見送らない（性別・役割・世界観から無難な外見を埋める） */
          else { try { dc = UX().directCheck(desc, s.gender); } catch (e) { dc = { ok: false, why: 'THREW' }; }
            if (!dc.ok && SENSITIVE[dc.why]) why = 'SKIP_' + dc.why;   /* left to the manual 2-tap (the Owner reads the draft) */
            else if (!dc.ok && lsGet(NOAI) === '1') why = 'SKIP_NOAI'; }
        }
        if (!why && vm && !(s && s.current && s.current.appearance)) { var vu = viconUnsafe(s && s.desc); if (vu) why = 'VAULT_' + vu; else if (!(dc && dc.ok)) why = 'VAULT_NO_DIRECT_' + String((dc && dc.why) || 'NONE').slice(0, 20); else { var vu2 = viconUnsafe(dc.draft && dc.draft.text); if (vu2) why = 'VAULT_DRAFT_' + vu2; else { var vd = viconVisual(dc.draft); if (!vd) why = 'VAULT_FEW_VISUAL'; else c.vd = vd; } } if (why) vcount(vstats.skip, why); }   /* ★VICON1: 隠した物語は AI なし・説明文の見た目の句（髪・瞳・服・顔・年代・体格の枠に当たる句）そのままだけ */
        if (!why && X.promo && !(s && s.current && s.current.appearance) && !(dc && dc.ok)) why = 'PROMO_NOT_DESC';   /* ★PROMOICON1 r2: 説明文の句をそのまま使える人だけ（推測・埋めの外見は登録しない） */
        if (why) { skip[hk(c.id)] = why; stats.skipped++; return; }
        if (!c.hero) npc++; c.dc = dc; tg.push(c); xt[hk(c.id)] = Date.now() - x0;
      });
      if (!tg.length) { soSet(id, function (so) { so.p = 'done'; so.why = 'NOTHING'; so.a = skip; }); return finish('A_NOTHING'); }
      tg.sort(function (a, b) { return (b.hero ? 1 : 0) - (a.hero ? 1 : 0); });
      soSet(id, function (so, r) { so.p = 'plan'; so.t = tg.map(function (c) { return hk(c.id); }); so.a = skip; if (!X.promo) r.starts = (r.starts || 0) + 1; });
      stats.plans++; note({ kind: 'PLAN', n: tg.length, hero: tg.some(function (c) { return c.hero; }), skipped: Object.keys(skip).length, cap: sc.src });
      tmSet(id, function (tm) { tm.a0 = ds(X.aT0 || Date.now()); tm.o = ds(X.t0); Object.keys(xt).forEach(function (h) { tm.c[h] = tm.c[h] || {}; tm.c[h].x = xt[h]; }); });   /* ★ICONFIX2 t */
      var i = 0, setAny = false, wrote = false;
      var endA = function (why) {
        soSet(id, function (so) { if (setAny) so.p = 'img'; else { so.p = 'done'; so.why = why || 'NO_PROFILE'; } });
        tmSet(id, function (tm) { tm.a1 = ds(Date.now()); });   /* ★ICONFIX2 t */
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
        if (s.current && s.current.appearance) { setAny = true; mark('conf'); if (vm) vstats.conf++; return next(); }   /* confirmed appearance: never changed silently */
        var desc = String(s.desc || '').trim(), dc = c.dc || { ok: false, why: '?' }, tw = Date.now();
        waitFor(quiet, WAIT_MS * 6, function (q) {
          if (!q) { mark('NOT_QUIET'); return endA('NOT_QUIET'); }   /* nothing sent for this character */
          var input = vm ? { name: '', gender: genderOf(s.gender), desc: '', confirmed: '', context: '', hero: c.hero, auto: true } : { name: c.name, gender: genderOf(s.gender), desc: desc, confirmed: '', context: lore().slice(0, 120), hero: c.hero, auto: true };   /* ★VICON1: 隠した物語では lore・説明文・名前を案へ渡さない */   /* ★ICONFIX3: auto = 案の失敗で見送らない（LC1prop が決まった語で埋める。旧い LC1prop は読まない） */
          stats.proposals++; if (dc.ok) stats.direct++;
          note({ kind: 'PROPOSE', direct: !!dc.ok });
          var tp = Date.now();
          (vm ? function (inp, cb0) { vstats.draft++; var dd = c.vd || null; setTimeout(function () { cb0(dd ? { ok: true, code: null, appearance: String(dd.text || ''), gender: genderOf(dd.gender), direct: true, aiCalled: false, vicon: 1 } : { ok: false, code: 'VAULT_NO_DRAFT', appearance: '', aiCalled: false }); }, 0); } : PR().propose)(input, function (res) {   /* ★VICON1: 隠した物語は文章 AI を呼ばない */
            res = res || {};
            var tpe = Date.now();
            tmC(id, h, function (t) { t.w = tp - tw; t.p = tpe - tp; t.ai = (res.aiCalled === true) ? 1 : 0; t.nh = res.nh ? 1 : 0; });   /* ★ICONFIX2 t: w = waiting for a quiet page, p = the proposal (AI or not) */
            if (res.fx3) { note({ kind: 'FX3', why: res.fx3.why, ai: res.fx3.ai || 0, det: res.fx3.det || 0, code: res.fx3.code || null }); soSet(id, function (so) { so.x = so.x || {}; so.x[h] = String(res.fx3.why) + ':' + (res.fx3.ai || 0) + '+' + (res.fx3.det || 0); }); }   /* ★ICONFIX3: 足した語の数だけ（語そのものは残さない） */
            if (fx2bOn() && !vm) {   /* ★ICONFIX2 b: the proposal is checked against the description's fixed facts (whatever path made it) ★VICON1: 隠した物語は説明文の句そのままなので戻す句を足さない */
              try { res = root.__v292DfixLC1prop.enforceFacts(res, input) || res; } catch (eF) { note({ kind: 'FACTS_THREW', e: String(eF).slice(0, 60) }); }
              var fc = res.facts;
              if (fc && !fc.skipped) {
                if (fc.fatal) stats.factsFatal++; else if (fc.ok) stats.factsOk++; else stats.factsRepaired++;
                if (fc.sexFixed) stats.factsSex++;
                note({ kind: 'FACTS', ok: !!fc.ok, miss: fc.missing.length, rep: fc.repaired.length, sex: fc.sexFixed || '', form: fc.form, fatal: fc.fatal || null });
                soSet(id, function (so) { so.f = so.f || {}; so.f[h] = fc.fatal ? 'fatal' : fc.ok ? 'ok' : ('rep' + fc.repaired.length + (fc.sexFixed ? 's' : '')); });
                if (fc.fatal) { mark('PROPOSE_FACTS_' + String(fc.fatal).slice(0, 16)); return next(); }   /* never an image with a fact missing; the manual 2-tap stays */
              }
            }
            var g = genderOf(s.gender) || (X.promo ? '' : genderOf(res.gender));   /* ★PROMOICON1 r2: 推測の性別は登録しない */
            var pv = A().previewProfile ? A().previewProfile({ gender: g, appearance: res.appearance || '' }) : { gender: g, appearance: String(res.appearance || '').trim() };
            if (!res.ok || !pv.appearance) { mark('PROPOSE_' + String(res.code || 'EMPTY').slice(0, 24)); return next(); }
            var tcw = Date.now();
            waitFor(function () { return saveClean(id) && quiet(); }, CLEAN_MS, function (ok) {
              if (!ok) { mark('NOT_CLEAN'); return endA('NOT_CLEAN'); }
              if (!same(id, a0)) return endA('RECHECK');
              var basis = (res.direct === true || res.aiCalled === false) ? 'desc' : 'ai';   /* ★STARTICON2: unknown → 'ai' (the less trusted label) */
              if (X.promo && !(res.direct === true && !res.fx3)) { mark('PROMO_NOT_DESC'); return next(); }   /* ★PROMOICON1 r2: 説明文の句そのままでない案（文章 AI・ICONFIX3 の埋め）は確定として書かない */
              stats.sets++; if (inFlight()) stats.sentWhileInFlight++; note({ kind: 'SET', ai: basis === 'ai' });
              var ts0 = Date.now();
              A().setProfile(c.id, { gender: pv.gender, appearance: pv.appearance, ownerConfirmed: true, origin: 'starticon_auto', basis: basis }, function (r2) {
                tmC(id, h, function (t) { t.cw = ts0 - tcw; t.s = Date.now() - ts0; });   /* ★ICONFIX2 t: cw = waiting for a clean save, s = the profile registration */
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
    var i = 0, transient = 0, serial = 0;   /* ★ICONFIX2 c: serial = per-character failures in a row */
    todo.forEach(function (c) { var t = so.ra && so.ra[hk(c.id)]; if (typeof t === 'number' && t > (X.leaseUntil || 0)) X.leaseUntil = Math.min(t, Date.now() + IF_WAIT_MS + IF_SPAN_MS); });   /* ★93-j: a reload in the middle of the wait keeps waiting */
    var endB = function (why, hold) {
      soSet(id, function (s) { if (why) { s.p = 'stop'; s.why = why; } else s.p = 'done'; });
      tmSet(id, function (tm) { tm.b1 = ds(Date.now()); });   /* ★ICONFIX2 t */
      if (hold) ssSet(HOLDK, hold);
      refreshPortraits(); finish(why ? 'B_STOP_' + why : 'B_DONE');
    };
    /* ★ICONFIX2 c: before the chain ends, the characters held after an unknown outcome are looked up again (read only, never re-sent) */
    var endB2 = function (why, hold) { if (!fx2cOn() || why === 'RECHECK') return endB(why, hold); reconcileUnknown(id, a0, function () { endB(why, hold); }); };
    var send = function (c, h, again) { vgAuth(id, function () { send0(c, h, again); }, function (w) { stats.vgAuthStop = (stats.vgAuthStop || 0) + 1; note({ kind: 'VG_AUTH_STOP', why: w }); finish('VAULT_AUTH'); }); };   /* ★VAULTSEND1 */
    var send0 = function (c, h, again) {   /* the one billable request for this character (again = the ONE retry after IN_FLIGHT) */
      soSet(id, function (s) { if (again) { s.r = s.r || {}; s.r[h] = 1; } s.b[h] = 'SENT'; });
      if (X.promo && !again) promoSent(id);   /* ★LIM1b: 昇格の絵も物語の枠に数える（送る前に） */   /* written BEFORE the call: a page closed mid-call never resends (and never retries twice) */
      stats.ef++; if (again) stats.ifRetry++; if (inFlight()) stats.sentWhileInFlight++; note({ kind: again ? 'EF_RETRY' : 'EF', hero: c.hero });
      var ti0 = Date.now();
      A().ensureFirst(c.id, {}, function (x) {
        var code = (x && x.code) || 'UNKNOWN';
        if (BILL() && BILL().isCode(code)) {   /* ★BILL1c r3: 絵は作られていない → この人は送っていない扱いに戻す（記録の stop・HOLD は付けない）。10 分たてばこのページでまた始まる */
          BILL().mark(id, code, { held: !!(x && x.held === true), by: 'starticon' }); BILL().notice(code); stats.efFail++; stats.bill = (stats.bill || 0) + 1; note({ kind: 'EF_BILL', code: code });
          soSet(id, function (s) { if (again) { s.b[h] = 'IN_FLIGHT'; if (s.r) delete s.r[h]; } else delete s.b[h]; });
          if (X.promo && !again) promoUnsent(id);   /* ★LIM1b: 送れなかった昇格の絵は数えない */
          X.bDone = false; return finish('B_BILL');
        }
        tmC(id, h, function (t) { t.i = Date.now() - ti0; t.code = String(code).slice(0, 24); if (again) t.rt = 1; });   /* ★ICONFIX2 t: the image request (one billable call) */
        if ((code === 'REGISTRATION_IN_PROGRESS') && x && !x.calls && transient < 5) { transient++; soSet(id, function (s) { if (again) { s.b[h] = 'IN_FLIGHT'; if (s.r) delete s.r[h]; } else delete s.b[h]; }); if (again) stats.ifRetry--; return setTimeout(next, 2000); }   /* refused on the device before any request (★93-j: a retry stays a retry) */
        note({ kind: 'EF_RES', code: code, calls: x && x.calls, retry: again ? 1 : 0 });
        if (code === 'IN_FLIGHT' && x && x.calls && retryOn()) {   /* ★93-j: the Worker answered 200 IN_FLIGHT (the account's lease is held by another picture) — nothing was made, nothing billed */
          stats.inflight++; stats.efFail++;
          X.leaseUntil = Date.now() + IF_WAIT_MS + Math.floor(Math.random() * IF_SPAN_MS);   /* no request to ANY character until then (the same account lease would answer IN_FLIGHT again) */
          if (!again) { soSet(id, function (s) { s.b[h] = 'IN_FLIGHT'; s.ra = s.ra || {}; s.ra[h] = X.leaseUntil; }); return next(); }   /* i is not advanced: the same character comes again after the wait (its one retry). ra = not before (kept across a reload) */
          stats.ifGiveUp++; i++; soSet(id, function (s) { s.b[h] = 'IN_FLIGHT2'; }); return next();   /* the second IN_FLIGHT: this character is left (manual stays) */
        }
        i++; soSet(id, function (s) { s.b[h] = String(code).slice(0, 32); });
        if (x && x.ok && EF_OK[code]) { if (code === 'EXISTS') stats.exists++; else stats.created++; serial = 0; var m0 = memNow(); tmC(id, h, function (t) { t.cr = ds(Date.now()); }); refreshPortraits(); watchDisplay(id, h, Date.now(), m0); return next(); }
        stats.efFail++;
        if (EF_STOP[code]) {
          var hd = holdOf(code, x);
          if (fx2cOn() && !hd && EF_ONE[code]) {   /* ★ICONFIX2 c: this character only — held, never re-sent; the others go on */
            serial++; if (code === 'OUTCOME_UNKNOWN') stats.unkContinue++;
            soSet(id, function (s) { s.u = s.u || {}; s.u[h] = Date.now(); if (code === 'OUTCOME_UNKNOWN') s.b[h] = 'UNKNOWN'; });
            X.leaseUntil = Math.max(X.leaseUntil || 0, Date.now() + IF_WAIT_MS + Math.floor(Math.random() * IF_SPAN_MS));   /* the Worker may still hold the account's lease for this picture: the next one waits like after IN_FLIGHT */
            note({ kind: 'EF_HOLD_ONE', code: code, serial: serial });
            if (serial >= UNK_SERIAL_MAX) { stats.unkSerialStop++; return endB2(code + '_X' + serial, null); }   /* two in a row = an outage, not this character: stop sending */
            if (code !== 'OUTCOME_UNKNOWN') return next();
            /* first look at the SAME character's result (after the lease wait, read only): made meanwhile → adopted; otherwise it stays held and the others go on */
            var wl = Math.max(0, (X.leaseUntil || 0) - Date.now()); note({ kind: 'UNK_LOOK_WAIT', ms: wl });
            return setTimeout(function () {
              if (!same(id, a0)) return endB('RECHECK');
              pointers(id, function (by) {
                if (by && by[c.id]) { serial = 0; stats.unkAdopted++; soSet(id, function (s) { s.b[h] = 'ADOPTED'; }); tmC(id, h, function (t) { t.cr = ds(Date.now()); t.code = 'ADOPTED'; }); note({ kind: 'UNK_ADOPTED', n: 1, at: 'look' }); refreshPortraits(); }
                next();
              });
            }, wl);
          }
          return endB2(code, hd);
        }
        serial = 0;   /* ★ICONFIX2 c: a definite answer (422 …) — the service is up */
        next();   /* 422 imgsafe / PROFILE_NOT_ENGLISH / CANDIDATES_PENDING / IN_FLIGHT (retry off) / IN_PROGRESS / LOST_RACE / UNGROUNDED …: this character only */
      });
    };
    var next = function () {
      if (i >= todo.length) return endB2(null);
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
          if (h2Hold()) { X.bDone = false; return finish('B_MAT_WAIT'); }   /* ★HOLD2 1b: nothing sent; resumes on this page when the promotion has ended */
          if (!same(id, a0)) return endB('RECHECK');
          var b0 = (soOf(id) || { b: {} }).b[h];
          if (b0 !== 'IN_FLIGHT') return send(c, h, false);
          /* ★93-j: the retry — first look whether the character got a picture meanwhile (the other request may have been for this same character) */
          pointers(id, function (by) {
            if (!same(id, a0)) return endB('RECHECK');
            if (by === null) { i++; soSet(id, function (s) { s.b[h] = 'IF_READ_FAIL'; }); stats.efFail++; return endB2('READ_FAIL'); }   /* = READ_FAIL of ensureFirst: stop, nothing sent */
            if (by[c.id]) { i++; stats.ifFilled++; soSet(id, function (s) { s.b[h] = 'FILLED'; }); note({ kind: 'IF_FILLED' }); refreshPortraits(); return next(); }   /* nothing sent */
            send(c, h, true);
          });
        });
      }, wait);
    };
    note({ kind: 'B_START', n: todo.length, try: so.bt });
    tmSet(id, function (tm) { if (!tm.b0) { tm.b0 = ds(Date.now()); tm.o2 = ds(X.t0); } });   /* ★ICONFIX2 t: the first B start (o2 = this page's open) */
    next();
  }
  /* ★ICONFIX2 c: read-only follow-up of the characters whose request had an unknown outcome. Never re-sends. A page closed while waiting leaves them 'UNKNOWN'
     (the next open of the story — while its tries last — looks again); after the last look they are 'UNKNOWN_HELD' (the manual 「結果を確かめる」 stays). */
  function reconcileUnknown(id, a0, cb) {
    var so = soOf(id) || { b: {} };
    var hs = Object.keys(so.b || {}).filter(function (h) { return so.b[h] === 'UNKNOWN'; });
    if (!hs.length) return cb();
    var k = 0;
    (function round() {
      var s1 = soOf(id) || { b: {} }, left = hs.filter(function (h) { return s1.b[h] === 'UNKNOWN'; });
      if (!left.length) return cb();
      if (k >= UNK_CHECK_MS.length) { soSet(id, function (s) { left.forEach(function (h) { s.b[h] = 'UNKNOWN_HELD'; }); }); stats.unkHeld += left.length; note({ kind: 'UNK_HELD', n: left.length }); return cb(); }
      var due = 0; left.forEach(function (h) { var t = ((s1.u || {})[h] || 0) + UNK_CHECK_MS[k]; if (t > due) due = t; });
      var wait = Math.max(0, due - Date.now()); k++;
      note({ kind: 'UNK_WAIT', ms: wait, n: left.length, round: k });
      setTimeout(function () {
        if (!same(id, a0)) return cb();
        pointers(id, function (by) {
          if (by) {
            var cm = {}; chars().forEach(function (c) { cm[hk(c.id)] = c.id; });
            var got = left.filter(function (h) { return cm[h] && by[cm[h]]; });
            if (got.length) { soSet(id, function (s) { got.forEach(function (h) { s.b[h] = 'ADOPTED'; }); }); stats.unkAdopted += got.length; note({ kind: 'UNK_ADOPTED', n: got.length }); got.forEach(function (h) { tmC(id, h, function (t) { t.cr = ds(Date.now()); t.code = 'ADOPTED'; }); }); refreshPortraits(); }
          }
          round();
        });
      }, wait);
    })();
  }
  /* ★ICONFIX2 t: display = the portrait list read again after the picture was made AND a picture body loaded (approximate; read only) */
  function memNow() { try { var P = root.__chronicleAv2Portrait; var st = P && typeof P.status === 'function' ? P.status() : null; return st && typeof st.mem === 'number' ? st.mem : -1; } catch (e) { return -1; } }
  function watchDisplay(id, h, t0, mem0) {
    if (!tmOn()) return; var P = root.__chronicleAv2Portrait; if (!P || typeof P.status !== 'function') return;
    var n = 0;
    (function poll() {
      var st = null; try { st = P.status(); } catch (e) { st = null; }
      if (st && st.listed && st.listed.at >= t0 && !st.listed.error && typeof st.mem === 'number' && st.mem > mem0) { var d = Date.now() - t0; tmC(id, h, function (t) { t.d = d; }); return; }
      if (++n > 120) { tmC(id, h, function (t) { t.d = -1; }); return; }
      setTimeout(poll, 250);
    })();
  }
  function timingOf(id, so) {
    if (!so || !so.tm) return null;
    var tm = so.tm, born = bornMs(id), T = function (v) { return typeof v === 'number' ? v * 100 : null; }, df = function (a, b) { return (typeof a === 'number' && typeof b === 'number') ? (a - b) * 100 : null; };
    var rows = Object.keys(tm.c || {}).map(function (h) { var t = tm.c[h] || {};
      return { h: h, extract: t.x, waitQuiet: t.w, propose: t.p, ai: t.ai, nh: t.nh, waitClean: t.cw, register: t.s, image: t.i, retry: t.rt || 0, code: t.code || null, display: t.d, createdFromBorn: (t.cr && born) ? T(t.cr) - born : null, createdFromBStart: df(t.cr, tm.b0) }; });
    var med = function (k) { var v = rows.map(function (r) { return r[k]; }).filter(function (x) { return typeof x === 'number' && x >= 0; }).sort(function (a, b) { return a - b; }); if (!v.length) return null; var m = v.length >> 1; return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2); };
    return { unit: 'ms', born: born, openFromBorn: (tm.o && born) ? T(tm.o) - born : null, aStartFromBorn: (tm.a0 && born) ? T(tm.a0) - born : null, aDur: df(tm.a1, tm.a0), reloadAfterA: df(tm.rl, tm.a1), bStartAfterA: df(tm.b0, tm.a1), bPageOpenToStart: df(tm.b0, tm.o2), bDur: df(tm.b1, tm.b0),
      median: { extract: med('extract'), propose: med('propose'), register: med('register'), image: med('image'), display: med('display'), createdFromBorn: med('createdFromBorn') }, rows: rows };
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
    if (h2Gate()) return;   /* ★HOLD2 1b */
    var lo = listOn(), why = inFlight() ? 'INFLIGHT' : (screenBusy(lo) || (lc1Busy() ? 'LC1' : null));
    if (why) {
      if (lo && why === 'MODAL') { if (!blockedSince) blockedSince = Date.now(); if (Date.now() - blockedSince > 3000) toastWait(document.querySelector('.v292Dfix145-modal') ? 'キャラ一覧を閉じると絵の準備を続けます' : '開いている画面を閉じると絵の準備を続けます'); }
      else if (why !== 'RECENT_ACTION') blockedSince = 0;
      return;
    }
    var listOpen = lo && !!document.querySelector('.v292Dfix145-modal');
    X.reloaded = true; stats.reloads++; if (listOpen) stats.listReload++; note({ kind: 'RELOAD', list: listOpen });
    try { var rid = sid(); if (rid) tmSet(rid, function (tm) { tm.rl = ds(Date.now()); }); } catch (eT) {}   /* ★ICONFIX2 t */
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
      if (h2Gate()) return;   /* ★HOLD2 1b */
      if (BILL() && BILL().stopped(sid())) { X.why = 'bill'; return; }   /* ★BILL1c: 何も送らない */
      var id = sid();
      if (X.story !== id) { X.story = id; X.firstTurns = null; X.okSince = 0; X.pageStop = null; X.bDone = false; X.bCounted = false; }
      var pq = (X.busy || X.needReload) ? null : promoQ(id);   /* ★PROMOICON1: 「NPC に昇格」の後の 1 回（このタブだけ・sessionStorage）。物語の始まりの pageStop より先に見る */
      if (pq && !X.promo){ X.promo = pq; X.pageStop = null; X.bDone = false; X.bCounted = false; X.okSince = 0; X.t0 = Date.now(); note({ kind: 'PROMO_START' }); }
      if (!pq && X.promo && !X.busy && !X.needReload) X.promo = null;
      if (X.busy || X.needReload || X.pageStop) return;
      var S = state(); if (!S || !Array.isArray(S.turns)) return;
      if (X.firstTurns === null) X.firstTurns = S.turns.length;
      var so = soOf(id);
      if (X.promo && so && (so.p === 'done' || so.p === 'stop')) { promoEnd(id, so.why || so.p); return; }
      if (X.promo && !so) {
        if (!chars().length) { if (Date.now() - X.promo.at > PROMO.waitMs) promoEnd(id, 'NO_ENTRY'); return; }   /* the registrar has not given the id yet */
        if (X.promo.mx === undefined) {   /* ★r2: 控えの絵があれば写すだけ（作らない）。分からなければ作らない */
          X.promo.mx = 'pending'; var Mx = root.__v292DfixMIDICON, pq0 = X.promo; if (!Mx || typeof Mx.promoExtra !== 'function') { promoEnd(id, 'PROMO_NO_MX'); return; }
          Mx.promoExtra(id, pq0.name, chars()[0].id, function (r) { if (X.promo !== pq0) return; if (!r || !r.known) return promoEnd(id, 'PROMO_MX_' + String((r && r.why) || 'UNKNOWN').slice(0, 16));
            if (r.extra) return promoEnd(id, r.claimed ? 'PROMO_EXTRA_CLAIMED' : 'PROMO_EXTRA_' + String(r.why || 'SHOWN').slice(0, 16)); pq0.mx = 'none'; });
          return; }
        if (X.promo.mx !== 'none') return;
        var pw = promoWhy(S, X.promo); if (pw) { promoEnd(id, pw); return; }
      } else if (!so) {
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
  /* ★PROMOICON1（laneAUTOICON1・2026-11-16・既定 OFF: localStorage v292DfixPROMOICON1On='1' で ON・kill v292DfixPROMOICON1Off='1'。毎回評価）:
     キャラ一覧の「NPC に昇格」の後、その 1 人について STARTICON と同じ手順（外見の下書き → 外見の登録 → 1 回の再読み込み → ensureFirst）を 1 回だけ。
     名前が一般名（老人）でもよい。鍵はアカウントの starticon1（STARTICON と同じ。費用・上限・imgsafe・利用権は Worker のまま）＋この端末の鍵。
     守り: 2 ターン以上の本文に出たか、会話ログの台詞が 2 つ以上の人だけ／この端末で 1 物語 2 人・1 日 5 人まで／送る前に記録・自動の再試行なし（93-j の IN_FLIGHT の 1 回は STARTICON と同じ）／
     物語の始まりの記録（starts）は数えない。名前は sessionStorage（このタブ）にだけ置き、localStorage には名前のハッシュだけ。 */
  var PROMO = { waitMs: 10 * 60 * 1000, perStory: 2, perDay: 5 }, PQK = 'v292DfixPROMOICON1_q', PLK = 'v292DfixPROMOICON1_v1';
  function promoOn() { return lsGet('v292DfixPROMOICON1Off') !== '1' && lsGet('v292DfixPROMOICON1On') === '1'; }
  function promoRec() { var r = null; try { r = JSON.parse(lsGet(PLK) || 'null'); } catch (e) {} if (!r || r.v !== 1 || r.day !== today()) r = { v: 1, day: today(), n: 0, st: (r && r.st) || {} }; return r; }
  function promoQ(id) { if (!promoOn()) return null; var q = null; try { q = JSON.parse(ssGet(PQK) || 'null'); } catch (e) {} return (q && q.story === id && typeof q.h === 'string') ? q : null; }
  function promoEnd(id, why) { note({ kind: 'PROMO_END', why: String(why || '').slice(0, 24) }); X.lastPromo = { why: why, at: Date.now() }; try { root.sessionStorage.removeItem(PQK); } catch (e) {} X.promo = null; X.busy = false; X.bDone = false; X.bCounted = false; }
  function promoWhy(S, q) {   /* '' = go */
    if (q.ok) return '';   /* checked and counted once per promotion (the tick comes back until phase A starts) */
    var sc = storyCap(), dc0 = capDayStarts();   /* ★r2: アカウントの LIM1（starticon_story_imgs・starticon_day_stories）より緩くしない。0 なら作らない */
    var perStory = Math.min(PROMO.perStory, sc.npcs), perDay = Math.min(PROMO.perDay, dc0); if (!(perStory > 0) || !(perDay > 0)) return 'PROMO_LIM_ZERO';
    var r = promoRec(); if (r.n >= perDay) return 'PROMO_DAY_CAP'; if (stCnt(r, q.story).d >= perStory) return 'PROMO_STORY_CAP';
    if (lim1bOn()){ var tot = (sc.hero ? 1 : 0) + sc.npcs, used = startUsed(q.story) + stCnt(r, q.story).s; if (!(used < tot)) return 'PROMO_STORY_LIM'; }   /* ★LIM1b: 物語の始まりの絵＋昇格の絵で、1 物語の枚数（starticon_story_imgs・行なし 4 枚）を超えない */
    var nm = String(q.name || ''), turns = 0, lines = 0; if (!nm) return 'PROMO_NO_NAME';
    (S.turns || []).forEach(function (t) { var hit = false; if (t && typeof t.narrative === 'string' && t.narrative.indexOf(nm) >= 0) hit = true;
      (Array.isArray(t && t._convSays) ? t._convSays : []).forEach(function (c) { if (c && c.who === nm) { lines++; hit = true; } }); if (hit) turns++; });
    if (turns < 2 && lines < 2) return 'PROMO_FEW';   /* すぐ消える端役には作らない */
    r.n++; var c0 = stCnt(r, q.story); c0.d++; r.st[hk(q.story)] = c0; try { lsSet(PLK, JSON.stringify(r)); } catch (e) {} q.ok = true;   /* counted before anything is sent */
    return '';
  }
  /* ★LIM1b（laneAUTOICON2・GPT #127-VB 4 (b)・既定 ON・kill v292DfixLIM1bOff='1' で r2 と同じ数え方）: 昇格の絵（ensureFirst を送った数）も、物語の始まりの STARTICON の絵と
     同じ 1 物語の枠に数える。控えの絵を写した（claim）・サーバーに絵があった（EXISTS）・読んだだけ（FILLED・ADOPTED）は数えない。記録は物語ごとに残る（日付で消えない）ので、昇格を繰り返しても枠は増えない。 */
  function lim1bOn() { return lsGet('v292DfixLIM1bOff') !== '1'; }
  function stCnt(r, story) { var v = r.st[hk(story)]; if (typeof v === 'number') return { d: v, s: v }; return (v && typeof v === 'object') ? { d: v.d || 0, s: v.s || 0 } : { d: 0, s: 0 }; }   /* r2 の数字の記録は送った数とみなす（多めに数える側） */
  var NOT_SENT = { NO_PROFILE: 1, FILLED: 1, IF_READ_FAIL: 1, EXISTS: 1, ADOPTED: 1 };
  function startUsed(story) { var r = rec(), so = r.st[hk(story)]; if (!so || !so.b) return 0; var n = 0; for (var k in so.b) if (Object.prototype.hasOwnProperty.call(so.b, k) && !NOT_SENT[so.b[k]]) n++; return n; }
  function promoSent(story) { var r = promoRec(), c0 = stCnt(r, story); c0.s++; r.st[hk(story)] = c0; try { lsSet(PLK, JSON.stringify(r)); } catch (e) {} }
  function promoUnsent(story) { var r = promoRec(), c0 = stCnt(r, story); if (c0.s > 0) c0.s--; r.st[hk(story)] = c0; try { lsSet(PLK, JSON.stringify(r)); } catch (e) {} }   /* ★BILL1c r3 */
  function promoted(name) {   /* fix145 の「NPC に昇格」が呼ぶ。鍵が無ければ何もしない */
    try { if (!promoOn() || killed()) return false; var id = sid(); var nm = String(name || '').normalize('NFC').trim(); if (!id || !nm) return false;
      if (ssGet(PQK)) return false;   /* one at a time */
      root.sessionStorage.setItem(PQK, JSON.stringify({ story: id, h: hk(nm), name: nm, at: Date.now() })); note({ kind: 'PROMO_ASK' }); return true; } catch (e) { return false; }
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
        vicon: { on: viconOn(), defaultOn: VICON1_DEFAULT_ON, why: (function () { try { return id ? (vaultHidden(id) ? (vaultOpenWhy(id) || 'OPEN') : 'NOT_HIDDEN') : null; } catch (eV) { return 'THREW'; } })(), stats: JSON.parse(JSON.stringify(vstats)) },   /* ★VICON1: 数と理由だけ */
        fx2: { facts: fx2bOn(), perChar: fx2cOn(), timing: tmOn() }, timing: (function () { try { return timingOf(id, so); } catch (eT) { return null; } })(),   /* ★ICONFIX2 */
        list: { on: listOn(), reopenPending: !!reopen, screen: screenBusy(listOn()) },   /* ★93-k */
        caps: (function () { var sc = storyCap(), d = capDayStarts(); return { dayStarts: d === Infinity ? -1 : d, hero: sc.hero, npcs: sc.npcs === Infinity ? -1 : sc.npcs, src: sc.src, lim: (root.__v292DfixADMF1 && typeof root.__v292DfixADMF1.limDecide === 'function') ? root.__v292DfixADMF1.limDecide('starticon_day_stories').why : 'no-admf1' }; })() }; },   /* ★LIM1 */
    promoted: promoted, promoStatus: function () { return { on: promoOn(), q: !!ssGet(PQK), active: !!X.promo, last: X.lastPromo || null, rec: (function () { var r = promoRec(); return { day: r.day, n: r.n }; })() }; },   /* ★PROMOICON1 */
    __t: { hk: hk, bornMs: bornMs, promoWhy: promoWhy, rk: rk, isNewStory: isNewStory, storyCap: storyCap, capDayStarts: capDayStarts, timingOf: timingOf }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof window !== 'undefined' ? window : this);
