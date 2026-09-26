/* v292Dfix889-secret-vault.js — SECRET_STORY_VAULT client **v7.5**
 * =====================================================================================
 * ★★v7.5（2026-09-21・コスト回帰の修正）:
 *   v7.4 との差は **ns をどこから貰うか 1 点だけ**。扉・BOOT BARRIER・印・backfill・
 *   imgconfirm の作法は 1 バイトも変えていない。
 *
 *   何が問題だったか:
 *     v7.3 が boot で **無条件に** `op:'imgmanifest'` を 1 本投げていた。ログイン済みの
 *     訪問者の **全 document**（HOME も含む）に 1 往復増える。これはコスト回帰であり、
 *     `sp18r_acceptance_v1.mjs` の GP-1（imgmanifest はちょうど 1 本）と
 *     WK-1（拒否された hide では probe 0 本）が赤くなる原因そのものだった。
 *     pin は意図して置かれたものなので、**pin ではなく client を直す**。
 *
 *   v7.5 の ns 取得（上から順に、安い順）:
 *     (1) **既に出ている** `imgmanifest` の応答から採る（backfill の probe）。
 *         もともと聞きに行く document では **往復は 1 本も増えない**。
 *     (2) 補助 cache `localStorage['v292Dfix891_ns']` = `<ns>:<epoch>:<adoptedAt>`、**TTL 6 時間**。
 *         HOME や拒否された hide の document では **1 本も投げない**。
 *         ★形が違う値（v7.3/v7.4 が書いた 2 項形を含む）は **無効として無視**する。
 *     (3) cache が空 or 期限切れ **かつ** その document が実際に
 *         「確認できない ns で画像 URL を組み立てようとした」ときだけ、**最大 1 本**の遅延 probe。
 *         **`load` の後 ＋ 2 秒 idle** まで待ち、**扉が armed のまま未 release の間は投げない**。
 *         その document で既に imgmanifest が出ていれば **投げない**。
 *
 *   ★コスト上限: **端末あたり 6 時間に 1 本**、しかも「backfill を伴わずに legacy ns の画像を
 *     描く document」だけ。backfill が走る document は **+0**。HOME は **+0**。
 *   ★`localStorage['v292Dfix400_ns']` は v7.3/v7.4 と同じく **hint として読むだけ**。
 *   対になる worker: **v46.7-ns-converge / imgNsSpec = w14.1-ns-converge**。
 * =====================================================================================
 * ★★v7.4（2026-09-21・GPT 裁定 #W14_IMPL ④ = PRE_ARM_CONFIRM の client 側）:
 *   v7.3 との差は **1 点だけ**。扉（gate）・BOOT BARRIER・印（token）・backfill・
 *   ns 収束（swapNs）の作法は 1 バイトも変えていない。
 *
 *   なぜ要るか:
 *     worker（w14.1）は旧 ns の画像 key を「歴代 artStyle enum × この account の全 story ×
 *     canonical cast name」で再計算し、**ちょうど 1 組**が一致したものだけを『候補』にする。
 *     しかし 31 bit の hash 一致は帰属の証明にならないので、候補のままでは image_owner に
 *     昇格しない（裁定「候補生成であり authority ではない」）。
 *     昇格できるのは「**その物語を実際に開いている認証済みの端末**が、key の原像
 *     （storyId ＋ canonName ＋ artStyle）を申告し、worker が全部再検証したとき」だけである。
 *     v7.4 はその申告を送る。
 *
 *   どう送るか:
 *     ・物語が開いた後（認証済み・扉が解けている）に **1 度だけ**、最大 32 件を 1 往復で。
 *     ・原像は client が **既に持っている**: fix197 の keyFor()（v292Dfix197-avatar-key.js:208）は
 *       `'n' + hash(resolveVariant764(canonName(name)) + '|' + artStyle())` で key を作っており、
 *       その 3 つ（正名 / 画風 / 物語 id）はこの document の engine state から読める。
 *       検証口も公開されている（fix197:599-601 の keyFor / canonName / resolveVariant764）。
 *     ・画面に出ている <img data-avpk> の pk と keyFor(name) を突き合わせて原像を決める
 *       （合わないものは送らない）。
 *     ・**断られても再送しない**（窓が閉じている＝ ARM 済み or 既に hidden が在る、が正常）。
 *     ・kill（v292Dfix889Off='1'）で止まる。扉・boot には 1 ミリ秒も割り込まない。
 *     ・★`localStorage['v292Dfix400_ns']` は **hint として読むだけ**。書かない・消さない。
 *   対になる worker: **v46.7-ns-converge / imgNsSpec = w14.1-ns-converge**。
 *   ★imgconfirm を知らない worker には 400/501 が返るだけで、**画面には何も起きない**。
 * =====================================================================================
 * ★★v7.3（2026-09-21・GPT 裁定 #W14_DESIGN = NS_CONVERGENCE の client 側）:
 *   v7.2 との差は **画像 URL の ns を server の言うとおりにする 1 点だけ**である。
 *   扉（gate）・BOOT BARRIER・印（token）・backfill の作法・送信の形は 1 バイトも変えていない。
 *
 *   何が壊れていたか（live 実測 / candidate/vault_preARM_live_acceptance_v1.md §3-c）:
 *     v292Dfix400-img-url.js は ns を `op:'meta'` から **一生に 1 度だけ**取得して
 *     localStorage['v292Dfix400_ns'] に永久 cache する（fix400:55 の guard）。その後 server 側の
 *     nsFor() が変わっても client は追従しないので、画面が使う ns と server が解決する ns が
 *     **互いに素**になる。どちらにも実体が在るので「表示は出るが server からは別物に見える」。
 *
 *   v7.3 がすること:
 *     ・認証済み `op:'imgmanifest'` の応答に w14 が足した `activeNs`（32 hex）を採用する。
 *     ・fix889 が **既に持っている** `__v292Dfix400.urlFor` の wrapper（:1386-1405）の中で、
 *       返ってきた URL の `ns=` だけを差し替える（swapNs）。形が違えば **何もしない**。
 *     ・`localStorage['v292Dfix891_ns']` は初回描画用の補助 cache にすぎない。
 *       **権威は毎 document の server 応答**で、来たら必ず上書きする。
 *     ・★`localStorage['v292Dfix400_ns']` は **読まない・書かない・消さない**。
 *       あれは migrate の hint 源であり、v7.2 へ戻したときの復帰値でもある。
 *     ・kill は v7.2 のまま（`v292Dfix889Off='1'` は UI だけを止め、絞り込みと扉は止まらない）。
 *       ns 収束は表示経路なので、ns 単体の kill は置かない（w14 側で CONVERGE を 0 にすれば
 *       `activeNs` が来なくなり、この hunk は自動的に no-op になる）。
 *   対になる worker: **v46.7-ns-converge**（candidate/storypass_worker/v22）。
 *   ★v46.6 以前（activeNs を返さない worker）に対しては **no-op**。先に上げても同時でも動く。
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
 * ★★v6（2026-09-21・GL-1 BLOCKER の修正 / GPT 裁定 #SP18R_INCIDENT 準拠）:
 *   v4 との差は **直 URL の扉の不動点 1 点だけ**である。送信の作法・絞り込み・画像経路は不変。
 *
 *   incident: `candidate/vault_preARM_live_acceptance_v1.md` §2（live sp18r・v4 sha16
 *             77887e55d923dbf0 で実測）。「この端末に本文が在り、かつ一度クラウドへ行った物語」を
 *             `index.html?story=<id>` で開くと **約 5 秒ごとに reload し続け、永久に開かない**。
 *   機序:     armGate() は条件が同じなら reload 後も再び arm し、解除の印をどこにも残さない。
 *             probeGate() の「開いてよい」枝は reopen() ＝ location.reload() だけ。
 *             releaseGate() は reload が例外を投げた catch からしか呼ばれない ⇒ **不動点が無い**。
 *
 *   ★v5（`candidate/vault/v5/`・sha16 7c8846be5e0b8d65）は裁定で **否決** された。
 *     否決理由（逐語要旨）: 「sessionStorage 60 s TTL 印は不採用 — **印だけで素通り禁止**。
 *     reload の保険を残すなら one-shot、かつ **次の document は印を消費する前に
 *     必ず server probe をやり直す**こと」。v5 は印を見た document が probe せずに
 *     扉を素通りしていたため、印が「通行証」として働いていた。v6 はそこを直してある。
 *
 *   v6:       **2 document・probe 必須**。
 *             document 1 … v4 と同一（罠 ＋ chrome 遮蔽 ＋ probe）。「開いてよい」2 枝だけが
 *                           単回印を書いて 1 回 reload する。他の枝は v4 のまま reload しない。
 *             document 2 … 印を **最初に無条件に消し**、罠は張らず（engine は本文を普通に読む）、
 *                           chrome は **同期で** 隠したまま `probeGate()` を **やり直す**。
 *                           開いてよい → 同じ document で releaseGate（reload 0 ＝ **不動点**）。
 *                           HIDDEN / NO_AUTH / UNCONFIRMED → dialog・**fail-closed**・本文は出さない。
 *             ★印だけでは扉は 1 度も開かない。素通り経路は 0 本である。
 *             ★reload 上限は同じ id につき 60 秒で 2 回。超えたら reload せず fail-closed。
 *             ★印を書いて読み返せない環境でも reload せず fail-closed（v5 の fail-open は廃止）。
 *             ★0-frame: chrome の遮蔽を bootGate（DOMContentLoaded）から armGate（`<head>` 同期）へ
 *               前倒しした。`#story` は 1 フレームも visible にならない。
 *   ★★v7（2026-09-21・裁定 #SP18R_INCIDENT follow-up: v6 = NOT_YET_FOR_PROD）:
 *     否決点: v6 の document 2 は **probe より前に engine を boot させていた**。本文は
 *       runtime（S.turns）へ入っており、画面に出さないのは CSS だけだった。
 *       「0-frame CSS では足りない — 他 script / 要約 / autosave / observer が S.turns を読める」。
 *     v7: index.html 側に **最小の BOOT BARRIER**（`BOOT_DEFER_UNTIL_VAULT_PROBE`）を入れ、
 *       **engine の最初の起動そのもの**（保存先キーの決定 :1450-1522 ＋ G.init() :3616）を
 *       1 つの関数 `window.__chrEngineBoot()` に畳む。
 *       document 2 では fix889 が <head> で `window.__chrBootDefer = true` を **同期で**立て、
 *       barrier は boot を **走らせない**。probe が「開いてよい」と答えたときだけ
 *       `openWithBoot()` が `__chrEngineBoot()` を **1 度だけ**呼ぶ。
 *       HIDDEN / NO_AUTH / UNCONFIRMED / 応答なし では **boot は一度も走らない**
 *       ＝ 本文は engine の runtime に 1 バイトも入らない。document 2 の reload は 0。
 *       barrier が無い deploy では `stats.bootBarrierMissing++` して fail-closed で止まる。
 *       **v6 の挙動へ落ちる経路は無い。**
 *   ★v7.1（2026-09-21・裁定の逐語順序への訂正）: document 2 でも **罠を張る**。
 *     v7.0 は「barrier が boot を止めるのだから doc 2 の罠は不要」と判断して張らなかったが、
 *     裁定の逐語は「必ず server probe → **success 時のみ mask 解除** ＋ 初回 boot 1 回」であり、
 *     mask は probe が成功するまで掛かったままでなければならない。
 *     openWithBoot() の順序も逐語に合わせた:
 *       (1) GATE.released = true（罠の mask を解く・画面はまだ隠れている）
 *       (2) window.__chrEngineBoot()（本物の本文を読んで隠れた #story へ描く）
 *       (3) showBodyChrome() + closeDialog()（ここで初めて画面に出す）
 *     効果: barrier が **無い** deploy でも engine は **本文なし**で立ち上がる
 *     （v7.0 の残余リスク 1 が閉じる）。GP-V7-xi が実測する。
 *   ★v7.2（2026-09-21・cap の巻き添えを断つ）: openWithBoot() が boot に成功したら
 *     `v889relN:<id>`（60 秒窓の reload 計数）と `v889rel:<id>` を **捨てる**。
 *     v7.1 では、物語を開いた後 60 秒以内に利用者が手動 reload を 2 回すると
 *     cap に当たって `RELOAD_CAPPED` で開けなくなっていた（fail-closed なので漏洩は無いが、
 *     server が visible と言っている自分の物語が最大 60 秒開けない）。
 *     cap は「成功に到達しない reload の連鎖」を止める安全網なので、成功後に 0 へ戻しても
 *     GL-1 の検知・封じ込めは弱くならない（ループはこの行に到達しない）。GP-V7-xiv が両面を実測する。
 *     patch: `candidate/vault/v7/index_boot_barrier.patch`（3 hunk・-3/+39 行）
 *     根拠と境界の説明: `candidate/vault/v7/BOOT_BARRIER.md`
 *   変えていないもの: owned===1 の厳密 orphan backfill / presence-only anon /
 *             kill switch v292Dfix889Off の意味 / __v292Dfix889 の公開面 /
 *             CACHED_HIDDEN・HIDDEN・NO_AUTH・UNCONFIRMED の fail-closed / 送信の作法。
 *   ★reload-free（同一 document で engine へ再入する）案は採れない。根拠は
 *     `candidate/vault/v6/CHANGES.md` §3（index.html に物語を開き直す API が 1 本も無く、
 *     `window.__chronicleDocumentStoryKey` が boot 時に **immutable** で決まるため）。
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
                probeOwnedFlag: 0, notArmed: 0,
                /* ★v6(GL-1 / 裁定 #SP18R_INCIDENT): 2 document 扉の観測。
                   tokenProbe = 印を消費して **probe をやり直した** document の数（正常は 1）、
                   tokenStale = 60 秒より古い印を捨てた回数（印は権限ではないので捨てて困らない）、
                   reloadCapped   = 60 秒窓の上限に当たって reload を **やめた** 回数、
                   tokenWriteFail = 印を書き戻せず reload を **やめた** 回数（sessionStorage 不可）。
                   ★reloadCapped / tokenWriteFail はどちらも **fail-closed** で止まる。
                     0 でない document は GL-1 級の異常であり、調査対象である。
                   ★v5 に在った `reloadUnsafe`（同条件で releaseGate する fail-open）は
                     裁定により **廃止**した。counter 名も別にしてある。 */
                tokenProbe: 0, tokenStale: 0, reloadCapped: 0, tokenWriteFail: 0,
                /* ★v7(BOOT_DEFER_UNTIL_VAULT_PROBE): engine 起動の観測。
                   bootDeferred = window.__chrBootDefer を立てた document の数（document 2 で 1）、
                   booted       = window.__chrEngineBoot() を実際に走らせた回数（開いたときだけ 1）、
                   bootBarrierMissing = barrier が deploy されていないのに document 2 に
                     入ってしまった回数。**0 でなければ deploy 事故**であり、
                     その document は fail-closed で止まっている（v6 へは落ちない）。 */
                bootDeferred: 0, booted: 0, bootBarrierMissing: 0,
                /* ★v7.3(NS_CONVERGENCE): nsAdopted = server の activeNs を採用した回数、
                   nsSwapped = <img> URL の ns= を実際に書き換えた回数、
                   nsMismatch = 採用値が手元の値と違った回数（＝ 収束が起きた回数）。 */
                nsAdopted: 0, nsSwapped: 0, nsMismatch: 0,
                /* ★v7.4(PRE_ARM_CONFIRM): confirmSent = imgconfirm を送った回数（正常は story ごと 1）、
                   confirmOk = worker が昇格させた key の数、
                   confirmRefused = 断られた回数（ARM 済み / hidden 在り / 非対応 worker なら正常）。
                   ★断られたらこの document では二度と送らない（confirmStop）。 */
                confirmSent: 0, confirmOk: 0, confirmRefused: 0,
                /* ★v7.5(コスト回帰の修正): nsLazyProbe = 遅延 probe を実際に投げた回数
                   （正常は 0。cache が空 or 期限切れで、かつ legacy ns の画像を描いた document でだけ 1）、
                   nsCacheHit / nsCacheStale / nsCacheBad = 補助 cache の読み取り結果。 */
                nsLazyProbe: 0, nsCacheHit: 0, nsCacheStale: 0, nsCacheBad: 0 };

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
    NS.seenManifest = true;      /* ★v7.5: 送信した時点で遅延 probe を抑止する（応答待ちでも） */
    stats.probe++;
    post(withVault({ op: 'imgmanifest' }), function (r, e) {
      var man = null;
      /* ★v7.3 / v7.5 source (1): backfill の probe も imgmanifest なので、**ここで ns を採る**。
         この document は既に聞きに行っているので **往復は 1 本も増えない**。
         ★v7.5: 応答が来た時点で seenManifest を立て、遅延 probe を永久に抑止する。 */
      NS.seenManifest = true;
      try { if (!e && okOf(r) && r.j && adoptNs(r.j)) nsResweep(); } catch (e2) {}
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
      /* ★v6: 解錠直後の reload も同じ口を通す（計数され、上限にも掛かる）。
         ここで印を書いてよいのは、**次の document が必ず probe をやり直す**からである
         （印は罠を張らない指示でしかなく、扉を開ける権限ではない）。
         解錠は「この端末が金庫を開けられる」ことしか言っていないが、その物語を
         描いてよいかは次の document の `probeGate()` が canonical 一覧に聞き直す。 */
      gateReload();
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

  /* ============================================ ★v6 / GL-1: 2 document・probe 必須 ====
   * v4 の欠陥（live 実測 `candidate/vault_preARM_live_acceptance_v1.md` §2）:
   *   probeGate() の「開いてよい」枝は reopen() ＝ location.reload() **だけ**を呼び、
   *   reload 後の armGate() は **同じ条件で再び arm する**。解除印がどこにも残らないので
   *   不動点が無く、約 5 秒ごとに reload し続けて物語が永久に開かない（BLOCKER）。
   *
   * ★v5（`candidate/vault/v5/`）は「60 秒 TTL の印だけで扉を素通りさせる」案だったが、
   *   GPT 裁定 #SP18R_INCIDENT で **否決**された:
   *     「sessionStorage 60 s TTL 印は不採用 — 印だけで素通り禁止。
   *       reload の保険を残すなら one-shot、かつ **次の document は印を消費する前に
   *       必ず server probe をやり直す**こと」。
   *   v6 はその逐語実装である。**印は権限ではなく「この document では罠を張るな」の指示**でしかない。
   *
   * v6 の形（不動点は document 2 に在る）:
   *   document 1（印なし）… v4 と同一。arm → 罠が `GATE.key` を隠す ＋ `#v889gatestyle` で
   *     chrome を隠す → `probeGate()`。**「開いてよい」2 枝だけ**が単回印
   *     `sessionStorage['v889rel:<id>']` を書いて **1 回だけ** reload する。
   *     他の枝（CACHED_HIDDEN / HIDDEN / NO_AUTH / UNCONFIRMED）は v4 のまま・fail-closed・reload しない。
   *   document 2（印あり）… `armGate()` が印を **最初に・無条件に消す**。60 秒より古い印は
   *     **無かったもの**として扱う（staleness であって通行証ではない）。新しい印のときは
   *       ・`armTrap()` を **呼ばない**（engine は local 本文を普通に読んで描く）
   *       ・しかし `GATE.armed = true` / `reason = 'TOKEN_PROBE'` を立て、
   *         `#v889gatestyle` を **同期で**掛けたまま（0-frame。画面には 1 フレームも出ない）
   *       ・`probeGate()` を **もう一度** 走らせる ＝ **probe 必須**
   *     TOKEN_PROBE の probe 結果:
   *       開いてよい → **同じ document で** `releaseGate()`（reload しない ＝ **不動点**）
   *       HIDDEN     → `gateLocked()`。chrome は隠れたまま。解錠できたら再び印を書いて reload
   *                    （document 3 でまた probe する）
   *       NO_AUTH / UNCONFIRMED → dialog・fail-closed・reload しない
   *
   * ★素通りは 1 本も無い。印が在っても、server がこの document で「開いてよい」と
   *   答えない限り `releaseGate()` は起きない。
   * ★reload 上限: 同じ id につき 60 秒で **2 回**。超えたら reload せず
   *   `gateUnconfirmed('offline')` で **fail-closed** のまま止まる（v5 の fail-open は裁定で否決）。
   * ★印を書いて読み返せないとき（sessionStorage 不可）も **reload しない**。
   *   そのまま fail-closed（「もう一度確認する」付きの unconfirmed dialog）。
   * ================================================================================= */
  var REL_TTL_MS = 60000;      /* 印の有効期間 ＝ 計数窓 */
  var REL_MAX = 2;             /* 同じ id につき 60 秒窓で許す reload の上限 */
  function relKey(id) { return 'v889rel:' + String(id); }
  function relNKey(id) { return 'v889relN:' + String(id); }
  function relRec(id) {
    var o = null;
    try { o = JSON.parse(ssGet(relNKey(id)) || 'null'); } catch (e) { o = null; }
    if (!o || typeof o !== 'object') return { n: 0, at: 0 };
    var at = (typeof o.at === 'number') ? o.at : 0;
    var n = (typeof o.n === 'number' && o.n > 0) ? o.n : 0;
    if (!at || (Date.now() - at) >= REL_TTL_MS) return { n: 0, at: 0 };   /* 窓を過ぎたら数え直す */
    return { n: n, at: at };
  }

  /* 扉から reload する唯一の口。reopen()（server が「開いてよい」と言った）と
     gateLocked() の解錠成功後だけが呼ぶ。どちらも **次の document が必ず probe をやり直す**
     ので、印を書いてよい。書けない / 上限に当たったときは **fail-closed のまま止まる**。 */
  function gateReload() {
    var id = GATE.id;
    var r = relRec(id);
    if (r.n >= REL_MAX) {                                    /* ★上限。fail-open しない */
      stats.reloadCapped++;
      GATE.reason = 'RELOAD_CAPPED'; gateUnconfirmed('offline'); return;
    }
    var stamp = Date.now();
    ssSet(relNKey(id), JSON.stringify({ n: r.n + 1, at: (r.at || stamp) }));
    ssSet(relKey(id), String(stamp));
    /* ★書いた印が読み返せないなら reload してはならない。次の document へ印が渡らず、
       v4 と同じ無限 reload になる。v5 はここで releaseGate() していたが（fail-open）、
       裁定 #SP18R_INCIDENT により **fail-closed** へ改めた。 */
    if (ssGet(relKey(id)) !== String(stamp) || relRec(id).n !== r.n + 1) {
      stats.tokenWriteFail++;
      try { ssDel(relKey(id)); } catch (e) {}
      GATE.reason = 'UNCONFIRMED'; gateUnconfirmed('offline'); return;
    }
    stats.reloads++;
    try { location.reload(); }
    catch (e) { try { ssDel(relKey(id)); } catch (e2) {} GATE.reason = 'UNCONFIRMED'; gateUnconfirmed('offline'); }
  }

  function reopen() { gateReload(); }

  /* ★v7: document 2 で server が「開いてよい」と答えたときの唯一の出口。
     engine の最初の起動は BOOT BARRIER（index.html の window.__chrEngineBoot）に預けてあり、
     **ここで初めて**走る。probe より前に本文が engine の runtime へ入る道は 1 本も無い。
     ★barrier が無い deploy（index.html に patch が当たっていない / 壊れている）では
       **絶対に v6 の挙動へ落ちてはならない**。数えて fail-closed で止まる。 */
  function openWithBoot() {
    var B = null;
    try { B = window.__chrEngineBoot; } catch (e) { B = null; }
    if (typeof B !== 'function') {
      /* barrier が deploy されていない ＝ engine は既に自力で boot 済みである。
         ★v7.1 では document 2 でも罠を張ってあるので、その boot は **本文なしで**立ち上がっている。
           したがって fail-closed で止めれば、画面にも runtime にも本文は無い。
           GATE.released は **立てない**（罠を解かない）。 */
      stats.bootBarrierMissing++;
      GATE.reason = 'BOOT_BARRIER_MISSING';
      gateUnconfirmed('offline');          /* fail-closed。遮蔽も罠も掛かったまま */
      return;
    }
    /* ★★v7.1: 裁定の逐語順序
         「必ず server probe → success 時のみ mask 解除 ＋ 初回 boot 1 回」
       (1) GATE.released = true … 罠が `GATE.key` を隠すのをやめる。**画面はまだ隠れている**。
       (2) __chrEngineBoot()    … engine が **本物の本文**を読み、隠れたままの #story へ描く。
       (3) showBodyChrome() + closeDialog() … ここで初めて画面に出す。
       ★(1) を (2) より前に置かないと、engine は罠に隠された「本文なし」を読んでしまい、
         `__chronicleDocumentStoryKey`（index.html:1510・immutable）が誤って確定する。
       ★(3) を (2) より後に置かないと、空の #story が 1 フレーム出る。
       ★boot が投げたら (3) へ進まない ＝ 画面は隠れたまま fail-closed。 */
    GATE.released = true;                  /* (1) 罠だけ解く。遮蔽 CSS は残す */
    var threw = false;
    try { if (B() === true) stats.booted++; } catch (e) { threw = true; }   /* (2) */
    if (threw) { GATE.reason = 'UNCONFIRMED'; gateUnconfirmed('offline'); return; }
    /* ★★v7.2: **成功に到達した**ので、この id の reload 計数を捨てる。
       cap（60 秒で 2 回）は本来「**成功に辿り着かない reload の連鎖**」を止めるための安全網であり、
       一度ちゃんと開けた後の手動 reload まで巻き込む必要は無い。
       v7.1 では計数が残るため、利用者が 60 秒以内に 2 回 reload すると
       server が visible と言っている自分の物語が最大 60 秒開けなくなっていた
       （`reason:'RELOAD_CAPPED'` ＋ 「オフラインのため…」dialog。offline 実測・GP-V7-xiv）。
       ★GL-1 型のループはこの行に **到達しない**（boot が成功しないと来ない）ので、
         計数はループ中に一度も減らず、検知・封じ込めは 1 バイトも弱くならない。
       ★印そのものは armGate() が同期で消費済みだが、念のためここでも消しておく
         （消し損ねた印が次の document を素通りさせることは無い ＝ 二重の保険）。 */
    try { ssDel(relNKey(GATE.id)); ssDel(relKey(GATE.id)); } catch (e) {}
    showBodyChrome(); closeDialog();       /* (3) ＝ releaseGate() の残り */
  }

  function probeGate() {
    if (GATE.probing) return;
    GATE.probing = true;
    refresh(function () {
      GATE.probing = false;
      var id = GATE.id;
      /* ★v6: document 2（印を消費して probe をやり直している document）かどうか。
         ここが true のときだけ、同じ document のまま扉を解いてよい。 */
      var tokenProbe = (GATE.reason === 'TOKEN_PROBE');
      if (VIS.state === 'ready') {
        /* 隠されていない */
        if (VIS.visible[id] && !VIS.hidden[id]) { if (tokenProbe) { openWithBoot(); return; } reopen(); return; }
        /* 隠されているが解錠済み */
        if (VIS.hidden[id] && VIS.open) { if (tokenProbe) { openWithBoot(); return; } reopen(); return; }
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
    /* ★v6: 印は **何よりも先に読み、無条件に消す**（単回）。
       60 秒より古い印は「無かったもの」として扱う ＝ staleness であって通行証ではない。
       ★ここで扉が開くことは無い。印は「この document では罠を張らない」だけを意味し、
         描いてよいかどうかは この document の `probeGate()` が server に聞き直す。 */
    var tokenFresh = false;
    var tok = ssGet(relKey(id));
    if (tok) {
      ssDel(relKey(id));                           /* one-shot: 読んだら必ず消す */
      var t = +tok;
      if (t > 0 && (Date.now() - t) < REL_TTL_MS) tokenFresh = true;
      else stats.tokenStale++;
    }
    if (!localBodyExists(id)) return;             /* (a) */
    if (provenLocalOnly(id)) return;              /* (b) 一度もクラウドへ行っていない */
    GATE.armed = true;
    /* ★★v7: 扉を張ったら **その document では必ず** engine の最初の起動を止める。
       document 1 でも document 2 でも同じである。
       ・document 1 … 「開いてよい」枝は boot ではなく **印を書いて reload** する（裁定どおり
         reload-once は engine 制約の妥協として受け入れられている）。したがって document 1 で
         __chrEngineBoot() が呼ばれることは **無い**。HIDDEN / 未確認でも当然呼ばれない。
       ・document 2 … probe が「開いてよい」と答えたときだけ openWithBoot() が 1 度だけ呼ぶ。
       ⇒ どちらの document でも、**server が答える前に本文が engine の runtime へ入ることは無い**。
       ★barrier（index.html の BOOT BARRIER）が無い deploy ではこの旗は誰も見ないので
         engine は従来どおり即座に boot する。その事故は openWithBoot() が
         stats.bootBarrierMissing として検出し、fail-closed で止める。 */
    try { window.__chrBootDefer = true; stats.bootDeferred++; } catch (e) {}
    if (tokenFresh) {
      /* ---- document 2: BOOT_DEFER_UNTIL_VAULT_PROBE -------------------------------
         ★v7 の核心。v6 はここで engine を普通に boot させ、本文が runtime に入ってから
           CSS で隠していた（裁定 #SP18R_INCIDENT follow-up で NOT_YET_FOR_PROD）。
           v7 は **engine の最初の起動そのものを止める**。
         ・window.__chrBootDefer = true を **同期で**立てる。この file は index.html の
           <head>（:698 近辺）で評価され、保存先キーを決める inline（:1450）よりも
           前に居るので、barrier は確実にこの旗を見る。
         ・chrome は同期で隠す（0-frame）。
         ・probe が「開いてよい」と答えたときだけ openWithBoot() が
           window.__chrEngineBoot() を **1 度だけ**呼ぶ。
           HIDDEN / NO_AUTH / UNCONFIRMED / 応答なしでは **一度も呼ばれない**。
         ★★v7.1: **罠もここで張る**（v7.0 は張っていなかった）。裁定の逐語は
           「必ず server probe → **success 時のみ mask 解除** ＋ 初回 boot 1 回」であり、
           mask は probe が成功するまで **掛かったまま**でなければならない。
           barrier が在る限り罠に触れる者は居ないが、barrier が **無い** deploy では
           罠だけが engine を本文なしで立ち上げる唯一の防壁になる（GP-V7-xi）。
           解くのは openWithBoot() の (1) だけである。 */
      stats.tokenProbe++;
      GATE.reason = 'TOKEN_PROBE';
      hideBodyChrome();                            /* ★同期。0-frame */
      armTrap();                                   /* ★v7.1: probe 成功まで mask は掛かったまま */
      return;
    }
    GATE.reason = readCache().hidden[id] ? 'CACHED_HIDDEN' : 'UNRESOLVED';
    /* ★v6: chrome を隠すのを bootGate()（DOMContentLoaded）まで待たない。
       この file は `<head>`・`#story` が parse される前に評価されるので、ここで掛ければ
       `#story` は **1 フレームも visible にならない**（0-frame）。 */
    hideBodyChrome();
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
  /* ================================================================== ns convergence ==
     ★v7.3。NS.active が入っていない間は v7.2 と 1 バイトも同じ挙動（swapNs は素通り）。 */
  var LS_NS = 'v292Dfix891_ns';
  var NS_TTL_MS = 6 * 60 * 60 * 1000;   /* ★v7.5: 補助 cache の寿命 = 6 時間 */
  var NS_IDLE_MS = 2000;                /* ★v7.5: load の後さらに待つ idle */
  var NS = { active: null, epoch: null, at: 0, probed: false,
             /* ★v7.5 の観測点:
                seenManifest … この document で imgmanifest が 1 本でも出たか（出ていれば遅延 probe は投げない）
                need         … 確認できない ns で画像 URL を組み立てようとしたか
                stale        … cache が在ったが期限切れだったか
                lazyArmed    … 遅延 probe を予約済みか（1 document 1 回） */
             seenManifest: false, need: false, stale: false, lazyArmed: false };
  function nsValid(v) { return typeof v === 'string' && /^[0-9a-f]{32}$/.test(v); }
  /* ★v7.5: cache は `<32hex>:<epoch>:<adoptedAt>` の 3 項。TTL 6 時間。
     ・形が違うもの（v7.3/v7.4 が書いた 2 項形も含む）は **無視**する（malformed 扱い）。
       2 項形には adoptedAt が無く TTL を判定できないため、採用してはいけない。
     ・期限切れは採用しない（NS.stale を立てるだけ）。以後は (1) か (3) が ns を決める。 */
  function nsLoadCache() {
    try {
      var raw = String(lsg(LS_NS) || '');
      if (!raw) return;
      var m = /^([0-9a-f]{32}):(\d+):(\d+)$/.exec(raw);
      if (!m) { stats.nsCacheBad++; return; }                 /* malformed ＝ 無いものとして扱う */
      var at = +m[3];
      if (!(at > 0) || (Date.now() - at) > NS_TTL_MS) { NS.stale = true; stats.nsCacheStale++; return; }
      NS.active = m[1]; NS.epoch = +m[2]; NS.at = 0;           /* at=0 ＝ server 未確認の補助値 */
      stats.nsCacheHit++;
    } catch (e) {}
  }
  /* server 応答から ns を採用する。**権威はここだけ**。 */
  function adoptNs(j) {
    if (!j || typeof j !== 'object') return false;
    if (!nsValid(j.activeNs)) return false;
    var ep = (typeof j.nsEpoch === 'number' && isFinite(j.nsEpoch)) ? j.nsEpoch : 0;
    if (NS.active && NS.active !== j.activeNs) stats.nsMismatch++;   /* 収束が起きた回数（観測用） */
    NS.active = j.activeNs; NS.epoch = ep; NS.at = Date.now();
    NS.need = false;
    stats.nsAdopted++;
    /* ★v7.5: adoptedAt を一緒に書く（TTL 判定に要る） */
    try { lss(LS_NS, NS.active + ':' + NS.epoch + ':' + Date.now()); } catch (e) {}
    return true;
  }
  /* URL の ns= だけを差し替える。形が合わなければ **原文をそのまま返す**（退行 0）。 */
  function swapNs(url) {
    var u = String(url || '');
    var re = /([?&]ns=)([0-9a-f]{32})(?=&|$)/;
    var m = re.exec(u);
    if (!u || !m) return u;
    if (!NS.active) {
      /* ★v7.5: 確認できない ns で URL を組み立てようとした。**URL は 1 バイトも変えない**が、
         この document は「ns を知る必要がある」と印を付け、遅延 probe を 1 本だけ予約する。 */
      NS.need = true;
      nsLazyArm();
      return u;
    }
    if (m[2] === NS.active) return u;
    stats.nsSwapped++;
    return u.replace(re, '$1' + NS.active);
  }
  /* ★★v7.5: 遅延 probe。**この経路以外に imgmanifest を新規に出す口は無い。**
     条件（すべて満たしたときだけ 1 本）:
       ・cache から ns を採れていない（NS.active が無い）
       ・この document で imgmanifest が **まだ 1 本も出ていない**（NS.seenManifest）
       ・この document が実際に ns を必要とした（NS.need）
       ・認証済み・kill されていない
       ・**扉が armed のまま未 release ではない**（gate 中は何も投げない）
       ・`load` の後 ＋ NS_IDLE_MS の idle を過ぎた */
  function nsLazyArm() {
    if (NS.lazyArmed || NS.probed || NS.active) return;
    NS.lazyArmed = true;
    var fire = function () {
      setTimeout(function () {
        try {
          if (NS.probed || NS.active || NS.seenManifest) return;
          if (!NS.need || uiOff() || !loggedIn()) return;
          if (GATE.armed && !GATE.released) return;
          NS.probed = true;
          stats.nsLazyProbe++;
          NS.seenManifest = true;
          post(withVault({ op: 'imgmanifest' }), function (r, e) {
            if (!e && okOf(r) && r.j && adoptNs(r.j)) { try { nsResweep(); } catch (e2) {} }
          });
        } catch (e) {}
      }, NS_IDLE_MS);
    };
    try {
      if (document.readyState === 'complete') fire();
      else {
        var once = false;
        window.addEventListener('load', function () { if (once) return; once = true; fire(); }, false);
      }
    } catch (e) { fire(); }
  }
  /* ns が変わったら、既に貼られている <img> を fix197/fix199 の sweep で引き直させる。 */
  function nsResweep() {
    try {
      var f = window.__v292Dfix197 || window.__v292Dfix199;
      if (f && typeof f.sweep === 'function') { f.sweep(); setTimeout(function () { try { f.sweep(); } catch (e) {} }, 800); }
    } catch (e) {}
  }

  /* ================================================================= pre-ARM confirm ==
     ★v7.4。ここで送るのは **key の原像**だけで、worker はそれを 1 つも信用せず再検証する。
     送らなくても画面は 1 ピクセルも変わらない（昇格は運用のための処理であって表示ではない）。 */
  var CONFIRM_MAX = 32;
  var confirmDone = {};          /* storyId ごと・この document で 1 度だけ */
  var confirmStop = false;       /* 一度断られたらこの document ではもう送らない */
  function legacyNsHint() {
    /* ★読むだけ。v292Dfix400_ns は migrate/confirm の hint 源であり、v7.3 と同じく
       **書かない・消さない**（v7.2 へ戻したときの復帰値でもある）。 */
    try { var v = String(lsg('v292Dfix400_ns') || ''); return /^[0-9a-f]{32}$/.test(v) ? v : ''; }
    catch (e) { return ''; }
  }
  function confirmItems() {
    var out = [];
    var F = null; try { F = window.__v292Dfix197 || window.__v292Dfix199; } catch (e) { F = null; }
    if (!F || typeof F.keyFor !== 'function') return out;
    var st = null;
    try { st = (typeof window.__chronicleGetState === 'function') ? window.__chronicleGetState('v889ns') : null; } catch (e) { st = null; }
    if (!st) return out;
    var art = '0';
    try { art = String((st.cfg && st.cfg.artStyle != null) ? st.cfg.artStyle : 0); } catch (e) { art = '0'; }
    var names = [];
    try { if (st.cast && st.cast.hero && st.cast.hero.name) names.push(String(st.cast.hero.name)); } catch (e) {}
    try {
      var np = (st.cast && st.cast.npcs) || [];
      for (var i = 0; i < np.length; i++) { if (np[i] && np[i].name) names.push(String(np[i].name)); }
    } catch (e) {}
    if (!names.length) return out;
    var sid = GATE.id || storyIdOfUrl();
    if (!sid) return out;
    /* 画面に実際に出ている pk だけを対象にする */
    var seen = {}, pks = [];
    try {
      var imgs = document.getElementsByTagName('img');
      for (var j = 0; j < imgs.length; j++) {
        var a = imgs[j].getAttribute && imgs[j].getAttribute('data-avpk');
        if (!a) continue;
        var kk = keyOf(a);
        if (seen[kk]) continue;
        seen[kk] = 1; pks.push(kk);
      }
    } catch (e) {}
    for (var p = 0; p < pks.length && out.length < CONFIRM_MAX; p++) {
      for (var n = 0; n < names.length; n++) {
        var pk = null;
        try { pk = F.keyFor(names[n]); } catch (e) { pk = null; }
        if (!pk || keyOf(pk) !== pks[p]) continue;
        /* ★送る正名は keyFor() が内部で使うのと同じ形（fix197:208）にそろえる */
        var cn = names[n];
        try { if (typeof F.canonName === 'function') cn = F.canonName(cn); } catch (e) {}
        try { if (typeof F.resolveVariant764 === 'function') cn = F.resolveVariant764(cn); } catch (e) {}
        out.push({ storyId: sid, canonName: String(cn), artStyle: art, k: pks[p] });
        break;
      }
    }
    return out;
  }
  function confirmTick() {
    try {
      if (confirmStop || uiOff() || !loggedIn()) return;
      if (VIS.state !== 'ready') return;                 /* server の返事が来ていない */
      if (GATE.armed && !GATE.released) return;           /* 扉が開いていない document では送らない */
      var sid = GATE.id || storyIdOfUrl();
      if (!sid || confirmDone[sid]) return;
      if (isHidden(sid)) return;                          /* hidden は worker 側でも拒否される */
      var legNs = legacyNsHint();
      if (!legNs) return;                                 /* 旧 ns を知らない端末は送るものが無い */
      if (NS.active && NS.active === legNs) return;        /* 収束済み ＝ 送る意味が無い */
      var items = confirmItems();
      if (!items.length) return;
      confirmDone[sid] = 1;                                /* ★送る前に立てる（二重送信させない） */
      stats.confirmSent++;
      post(withVault({ op: 'imgconfirm', legacyNs: legNs, items: items }), function (r, e) {
        if (e || !r || !r.j) { confirmStop = true; return; }
        if (r.j.ok === true) { stats.confirmOk += (+r.j.confirmed || 0); return; }
        /* CONFIRM_CLOSED（ARM 済み / 既に hidden が在る）・unsupported・bad-op はすべて
           「この deploy では送っても意味が無い」を意味する。★再送しない。 */
        stats.confirmRefused++; confirmStop = true;
      });
    } catch (e) {}
  }

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
      var u = orig.apply(this, arguments);
      /* ★v7.3: server が名乗った active ns へ寄せる。NS.active が無ければ原文のまま。 */
      try { u = swapNs(u); } catch (e) {}
      return u;
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
    nsLoadCache();               /* ★v7.3: 初回描画用の補助値（権威ではない） */
    wrapImgUrl();
    setTimeout(wrapImgUrl, 1200);
    setTimeout(wrapImgUrl, 4000);
    /* ★★v7.5: v7.3 の無条件 boot probe は **削除した**。ns は
       (1) 既に出ている imgmanifest / (2) TTL 付き cache / (3) 必要になった document だけの
       遅延 probe 1 本、の順に得る。boot では 1 本も投げない。 */
    /* ★v7.4: 扉にも engine boot にも割り込まない位置で、開いた後に 1 度だけ試みる。 */
    setTimeout(confirmTick, 3000);
    setTimeout(confirmTick, 9000);
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
    /* ★v7: BOOT BARRIER の観測（追加のみ・既存 field は不変） */
    boot: function () {
      var B = null; try { B = window.__chrEngineBoot; } catch (e) { B = null; }
      return { barrier: (typeof B === 'function'), deferRequested: (window.__chrBootDefer === true),
               ran: !!(B && B.__ran), booted: stats.booted, missing: stats.bootBarrierMissing };
    },
    imgSrc: fetchImg,
    /* ★v7.3 の観測口（読み取りのみ） */
    ns: function () { return { active: NS.active, epoch: NS.epoch, confirmed: (NS.at > 0), probed: NS.probed,
                              seenManifest: NS.seenManifest, need: NS.need, stale: NS.stale, lazyArmed: NS.lazyArmed,
                              ttlMs: NS_TTL_MS, idleMs: NS_IDLE_MS }; },
    nsSwap: swapNs,
    /* ★v7.4 の観測口（読み取りのみ・送信はしない） */
    confirmItems: confirmItems,
    confirmState: function () { return { stopped: confirmStop, stories: Object.keys(confirmDone), max: CONFIRM_MAX }; },
    limit: function () { return { code: LIMIT.code, retryAfterMs: LIMIT.retryAfterMs, keepLocal: LIMIT.keepLocal, count: LIMIT.count }; },
    status: function () {
      return { uiOff: uiOff(), v: 7.5, state: VIS.state, canon: canonState(), open: VIS.open, unlocked: !!session(),
               hidden: Object.keys(VIS.hidden).length, visible: Object.keys(VIS.visible).length,
               loggedIn: loggedIn(), fetchWrapped: fetchWrapped,
               backfill: { running: backfill.running, left: backfill.queue.length, done: backfill.done,
                           skipped: backfill.skipped, capped: backfill.capped, storyId: backfill.storyId,
                           probing: backfill.probing, probeMode: backfill.probeMode,
                           probed: backfill.probed, owned: backfill.owned, orphan: backfill.orphan,
                           probeFail: backfill.probeFail, storyRequired: backfill.storyRequired },
               limit: { code: LIMIT.code, retryAfterMs: LIMIT.retryAfterMs, keepLocal: LIMIT.keepLocal, count: LIMIT.count },
               gate: { armed: GATE.armed, released: GATE.released, reason: GATE.reason },
               ns: { active: NS.active, epoch: NS.epoch, confirmed: (NS.at > 0), probed: NS.probed,
                     seenManifest: NS.seenManifest, need: NS.need, stale: NS.stale, lazyArmed: NS.lazyArmed },
               confirm: { stopped: confirmStop, stories: Object.keys(confirmDone).length },
               stats: stats };
    }
  };
  try { console.log(TAG, 'loaded v7.5', uiOff() ? 'UI-OFF(filter stays)' : 'ON'); } catch (e) {}
})();
