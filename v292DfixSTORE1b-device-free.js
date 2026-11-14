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
 *
 * ■★PURGE1 段階 1（Local prototype・既定 OFF・localStorage v292DfixPURGE1On='1' のときだけ。kill v292DfixPURGE1Off='1'）
 *   Owner 裁定 2026-11-12「明示的に削除した物語は、復旧できない完全削除を基本仕様にしていい」。STORE1b の関門のうち
 *   「端末の控えを残す」ためだけにあったもの（S3 本文保持・S4 内容一致・未送信の印・snapshot・その物語だけの控え）を外し、
 *   この端末に残ったその物語のキーを snapshot と控えまで含めて消す。残すのは meta の墓標だけ（復活を止める根拠）。
 *   変えないもの: KEY1 の完全一致・同じ実行の /api/auth/me 前後・サーバーの deleted===true（404 は証拠にしない）・
 *   排他 Lock・開いている/最近開いた・別アカウント・旧 id・HOME を開くだけでは消さない・1 件ずつ・最初の失敗で止める。
 *   Vault で隠した物語の墓標は、さらに v292DfixPURGE1VaultOn='1' のときだけ「名前だけで消す」（値を 1 回も getItem しない）。
 *   そのときサーバーの確認は本文を含まない一覧の行（listshadow）だけで行う。
 *   OFF のときは r2 と 1 バイトも同じ動き（PURGE1 の関数は呼ばれない）。
 * ■★PURGE1c（GPT #127-SK・段階 1 の QA 条件。既定 OFF のまま）
 *   ・「未送信なし」: f781g が DIRTY_INTENT / DIRTY_LOCAL / DIVERGED / BOOTSTRAP_HOLD（unsynced）、f911 / f697p / 945_rescue がある
 *     （stash / journal / rescue。名前の列挙だけで見る）物語は消さない。
 *   ・題名（Q12）: 本文などを全部消したら、最後の同期の印を消す前に meta の墓標の title / name を '' にし purgedAt を足す（同じ 2 つの Lock の中）。
 *     墓標の id・deleteOpId・recoverySnapshotId・lifecycleVersion・serverTombstone は変えない。途中で止まれば次の実行が続きを片づける。
 *   ・保護判定（P0-B）: fix569 → fix562.scopedProtection（名前と凍結した proof だけ）。ほかの物語のキーの値は読まない。
 *   ・Vault で隠した物語（v292DfixPURGE1VaultOn）はこのレーンでは使わない（OFF のまま。シート・記録に題名を出さない）。
 * ■★STUCK1（Local 候補・未出荷。kill v292DfixSTUCK1Off='1' → r2 / PURGE1c と 1 バイトも同じ判断）
 *   実測（Owner の端末 2026-11-13）: DL2 の「物語を削除」（allowDirty）で消した物語のうち、削除のときに同期の印 f781g が
 *   DIRTY_INTENT / DIRTY_LOCAL だったもの（墓標の serverTombstone.localState に記録される）は、その後だれも印を CLEAN に
 *   戻さない（物語はもう開けない）ため、L6「未送信なし」で永久に 'unsynced' になり、シートに出なかった。
 *   直し方（DP1・GPT #127-GS と同じ考え方。新しい serializer は作らない）: 印が DIRTY_INTENT / DIRTY_LOCAL でも、
 *     ・墓標がサーバー確認済み（serverTombstone あり）・削除の時点の印の状態（serverTombstone.localState）が今の印と同じ・
 *       送信中でない・印の storyId が一致・印が削除より後に書かれていない とき、
 *     L6 の 'unsynced' をその場で決めずにサーバーの確認へ回す。
 *     ・getstory の serverHash（Worker deletestory2 が作った墓標の hash）と、この端末の fix697.projectionV2(id) に
 *       deleted:true・title＝墓標の title を入れた canonicalString の SHA-256 が 1 文字も違わないときだけ通す
 *       （＝この端末に、サーバーに無い変更は無い）。作れない・違う → 'unsynced-unproven'（従来どおり残す）。
 *     ・DIVERGED / BOOTSTRAP_HOLD / 送信中 / 印が読めない / f911・f697p・rescue は今までどおり止める。
 *   シートの「確かめられなかった」の数から 'nothing-left'（もう片づけ済みで墓標だけ残る物語）を外し、別に数える。
 *   観測: __v292DfixSTORE1b.explain(id) …… その 1 件だけの理由コード（何も消さない・書かない）
 * ■★STUCK1 r2（GPT #127-TJ 条件。Local 候補・未出荷。★既定 OFF: localStorage v292DfixSTUCK1On='1' のときだけ。kill v292DfixSTUCK1Off='1' が勝つ）
 *   OFF（既定）→ r2 / PURGE1c と同じ判断・同じ読み取り順（STUCK1 の関数は 1 キーも余計に読まない）。
 *   ・一致を確かめられない／違う → 'unsynced-unproven'（消さない）。DIVERGED / BOOTSTRAP_HOLD / 送信中 / rescue / f911 / f697p は従来どおり止める。
 *   ・projectionV2 の外のサイドストア（FAMILY_CLASS）: 印が DIRTY だった物語（dirtyProven）は
 *       (a) projectionV2 に入っている（fix743 keysFor の 12 本＋本体）と (b) 作り直せる控え・派生・表示用の印 だけ消す。
 *       (c) この端末にしか無いかもしれない（長期記憶 fix135〜137・準登録 fix277・ロスター fix298・外見 fix766・Memory Engine mem1・av2 の登録待ち/移行記録・形の分からないもの）は残す。
 *       (c) を 1 本でも残すときは同期の印 f781g も残す（次の実行は本体が無いので一致を確かめられず 'unsynced-unproven' で止まる＝安定）。
 *     印が CLEAN の物語（r2 の従来の対象）の消す範囲は変えない（planByReason で (c) の量だけ見せる）。
 *   ・消す直前の確かめ直し: 計画を作ってから消す直前（2 つの Lock の中・同期）までに、ほかのタブがその物語のキー・chr6_slots_meta を
 *     書いた（storage イベント）→ 'other-tab-write'。meta の墓標の行が 1 文字でも変わった → 'meta-changed'。キーと値（同期の印を含む）は従来どおり samePlan。
 *   ・__v292DfixSTORE1b.planByReason() …… 読み取りだけ（消さない・書かない・ログも書かない）。理由ごとの物語の数と、キーの family ごとの
 *     キー数・文字数（id・題名・値は返さない）。Vault に関わる物語（vault / passcode / vault-*）と id の形・保護は数だけ（キーを 1 本も見ない）。
 * ■★ZT1（laneSAVE1・GPT #127-TN「0 ターンの削除済み物語」。既定 OFF: localStorage v292DfixZT1On='1' のときだけ。kill v292DfixZT1Off='1' が勝つ）
 *   0 ターンのまま削除した物語は、サーバーの墓標の本文も 0 ターン（record.body.turns = []）なので S3 の 'server-body-not-held' で永久に残った。
 *   ZT1 は「サーバーの空の状態とこの端末が一致し、未送信が無い」と証明できたときだけ、S3 の代わりに通す:
 *     ・サーバー: deleted===true・record.body.turns が配列で 0 件。この端末: 本体が読めて turns が配列で 0 件。
 *     ・証明（必須・印が CLEAN でも行う）: fix697.projectionV2(id) に deleted:true と墓標の title（meta の墓標の行）を入れた canonicalString の SHA-256 が、
 *       getstory の serverHash（Worker が作った墓標の hash）と 1 文字も違わない（＝cast・設定・場面など本文以外もサーバーと同じ）。STUCK1 と同じ導出。
 *     ・印が DIRTY_INTENT / DIRTY_LOCAL でも、本体が 0 ターン・送信中でない・印の storyId が一致・削除の後に印が書かれていない・墓標がサーバー確認済み
 *       なら、上の証明へ回す（DIVERGED / BOOTSTRAP_HOLD / 送信中 / f911・f697p・rescue・Vault・パスコード・開いている は今までどおり止める）。
 *       このとき消すキーは STUCK1 r2 と同じ a / b だけ（c＝この端末にしか無いかもしれないものと同期の印は残す）。
 *   題名で決めない（題名は hash の入力の一部として一致を求めるだけ）。Vault を迂回しない。OFF のときは 1 バイトも同じ判断（ZT1 の関数は何も読まない）。
 * ■★FREE2（laneFREE2・Owner 承認の範囲「サーバー側の削除状態と一致し、未同期の変更がないと確認できたものに限り、端末内の写しを整理」。
 *   既定 OFF: localStorage v292DfixFREE2On='1' のときだけ。kill v292DfixFREE2Off='1' が勝つ。OFF のときは 1 キーも余計に読まず同じ判断）
 *   実測（Owner PC 2026-11-14）: 公式の削除シート（SD1 が通った削除）で消した試験物語の写しが、同期の印 f781g が DIRTY_INTENT / DIRTY_LOCAL
 *   （または送信中の印が残ったまま）だったために L6 の 'unsynced' / 'in-flight' で止まり、空き容量のシートに出なかった。
 *   DL2（v292DfixDL2-server-delete.js）が削除の成立の直後に「削除の時点で、この端末の全体（fix697.projectionV2）＝サーバーの墓標」を
 *   SHA-256 で確かめられたときだけ、証明 v292DfixFREE2_proofs[id] = { v, h: 墓標の hash, rev, at, mk: その時の印の指紋 } を残す。
 *   （jr = その時に送信の記録 f697p が残っていればその指紋。無ければ null）
 *   STORE1b は、その証明があり・印と送信の記録が証明の時から 1 文字も変わっておらず・墓標の rev が同じ物語だけ、L6 をその場で決めずにサーバーの確認へ回す:
 *     getstory の serverHash・rev が証明と同じ、かつ いまの端末の全体（projectionV2＋deleted＋サーバーの墓標の title）の SHA-256 がその hash と
 *     1 文字も違わない → 通す（dirtyProven。消すのは STUCK1 r2 と同じ a / b だけ。c と同期の印は残す）。1 つでも違う → 'unsynced-unproven'。
 *     送信の記録 f697p は消さない（残るときは同期の印も残す）。
 *   もう 1 つ（同じ鍵）: L5 の 'active-slot'。chr6_active_slot は最後に開いた物語の写しで、削除しても次に別の物語を開くまで残る。
 *   サーバーで確かめて立てた墓標のある物語については理由にしない（開いているかは Web Lock と lastOpenedAt 10 分で見る＝従来どおり）。
 *   証明が無い物語（FREE2 より前に消した写し・削除の時点で端末がサーバーと違った写し）は今までどおり。DIVERGED / BOOTSTRAP_HOLD / f911 / f697p /
 *   rescue / 削除の計画が開いている / Vault・パスコード / 開いている は今までどおり止める。全キー名の一覧は作らない。自動では消さない（シートで選ぶ）。
 * ■★FREE2c（GPT #127-TV 2: 全員既定 ON の前提条件。kill v292DfixFREE2Off='1' は維持。v292DfixFREE2On は読まない）
 *   既定 ON: localStorage v292DfixFREE2Off='1' でなければ FREE2 が効く（kill のときは STORE1b r2 / FREE2 前と同じ判断・同じ読み取り）。
 *   ・判定を 1 つにまとめた: judgeOne(id) が「計画 → 本文 → 保存の送信中 → getstory → 内容の一致 → 証明 → 墓標の hash → 消すキー → タブで開いているか」を決める。
 *     シート（survey）・dry-run（free2DryRun）・explain・実行（freeOne の Lock の中）が同じ judgeOne を通る。実行だけは
 *     Web Lock の query の代わりに exclusive・ifAvailable で取った Lock の中で judgeOne を呼ぶ（もっと強い確かめ方）。
 *   ・公式の削除シートで立てた墓標（serverTombstone.source='dl2-delete'）の物語は、印が CLEAN でも、この端末の全体（projectionV2＋deleted＋サーバーの title）
 *     の SHA-256 がサーバーの墓標の hash と同じときだけ通す（違う → 'tomb-hash-mismatch'・確かめられない → 'tomb-hash-unproven'）。実行のときも Lock の中でもう一度。
 *   ・この画面（HOME）の fix697 がその物語の保存を送っている最中 → 'in-flight'。
 *   ・explain(id) に openLock（その物語の Web Lock を持っている数・待っている数・mode ごとの数。だれのものかは返さない）を足した（原因の切り分け用・読むだけ）。
 * ■★FREE2d（SMOKE3 の tomb-hash-mismatch と遅い dry-run）
 *   ・Memory Engine（fix793）は物語画面だけが読む。物語画面の保存は sidecar.memoryV1 を送るが、HOME の projectionV2 には入らない
 *     （fix743 は fix793 が無ければ memoryV1 を生やさない）→ ME が有効な物語は、端末とサーバーが同じでも hash が必ず違った。
 *     サーバーの行（getstory の record.sidecar）が memoryV1 を持つときだけ、この端末の v292Dmem1_slot_<id> の値（無ければ null）を
 *     sidecar.memoryV1 として hash に入れる。一致は hash で決まる（値が違えば今までどおり消さない）。kill v292DfixFREE2dOff='1' → FREE2c と同じ。
 *   ・サーバーで本文を持たない墓標（server-body-not-held）は、同じ meta の墓標の行のあいだ、この画面のメモリで覚えて getstory を繰り返さない。
 *     getstory は最大 4 本まで同時（シート・dry-run の候補の確かめ）。結果の順は候補の順のまま。実行（freeOne）は今までどおり 1 件ずつ。
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
  /* ★PURGE1 */
  var PURGE_ON = 'v292DfixPURGE1On', PURGE_OFF = 'v292DfixPURGE1Off', PURGE_VAULT = 'v292DfixPURGE1VaultOn', PVERSION = 'PURGE1-s1c';
  var NOTICE_P = '削除した物語の残りを、この端末から完全に消します。スナップショットと控えも消えます。元に戻せません';
  /* ★STUCK1 */
  var STUCK_OFF = 'v292DfixSTUCK1Off', STALE_DIRTY = { DIRTY_INTENT: 1, DIRTY_LOCAL: 1 }, HEX64 = /^[0-9a-f]{64}$/;
  /* ★STUCK1 r2: 既定 OFF（On='1' のときだけ・Off='1' が勝つ）。キーの family の分類（#127-TJ 条件 3）
     a = projectionV2（fix697 → fix743.buildSchema2Record）に入る＝サーバーの墓標の hash に含まれる
     b = 作り直せる控え・派生・表示の印（本文やほかのキーから同じものが作られる／アプリ自身の GC が消す／中身を持たない）
     c = この端末にしか無いかもしれない（AI が作った長期記憶・手で選んだ退場・固定した外見・登録待ち など）。証明が無いので消さない
     この表に無い family・形の分からないキーは c と同じ扱い（消さない） */
  var STUCK_ON = 'v292DfixSTUCK1On', SVERSION = 'STUCK1-r2';
  var ZT_ON = 'v292DfixZT1On', ZT_OFF = 'v292DfixZT1Off';   /* ★ZT1 */
  var F2_ON = 'v292DfixFREE2On', F2_OFF = 'v292DfixFREE2Off', F2_KEY = 'v292DfixFREE2_proofs', F2_VERSION = 'FREE2-r3';   /* ★FREE2 */
  var FAMILY_CLASS = {
    'chr6_slot_': 'a', 'chr6_relations_': 'a', 'chr6_char_states_': 'a', 'chr6_char_flags_': 'a', 'chr6_pending_dice_': 'a',
    'chr6_turn_summaries_': 'a', 'chr6_chapter_titles_': 'a', 'chr6_scene_breaks_': 'a', 'chr6_scene_summaries_': 'a',
    'v292Dfix77States_slot_': 'a', 'v292Dfix307Roster_slot_': 'a', 'v292aiInstr_slot_': 'a', 'v292cover_seed_': 'a',
    '__gen_chr6_slot_': 'b',                 /* 本体の古い世代（fix264b の GC が消してよいものとして扱う） */
    'chr6_v292Dfix104_dlg_slot_': 'b',       /* 会話ログ抽出キャッシュ（turns から作り直す） */
    'chr6_v292Dfix54_genderMap_': 'b',       /* body.cast の性別の写し（fix54 の best-effort mirror） */
    'v292Dfix640Evid_slot_': 'b',            /* 証拠台帳（turn.plan.narrative から採取するだけ） */
    'v292Dfix307Last_slot_': 'b',            /* どのターンまで処理したかのカーソル */
    'v292Dfix924LinRev_slot_': 'b',          /* 系譜を作り直した版の印 '924' */
    'v292Dfix970Log_': 'b',                  /* 観測ログ（shadow・最大 40 件） */
    'v292Dav2_blk_': 'b', 'v292Dav2_cfl_': 'b',   /* 登録の断り／競合の印（中身なし・取り直しで消える） */
    'v292Dfix640PgOn_slot_': 'b', 'v292Dfix844On_slot_': 'b', 'v292Dfix845On_slot_': 'b', 'v292DfixCmfOn_slot_': 'b',
    'v292Dfix382Touched_slot_': 'b', 'v292Dfix374Chosen_chr6_slot_': 'b', 'v292DfixB37onb_': 'b',   /* 表示・機能の印 */
    'chr6_v292Dfix135_sum_slot_': 'c', 'chr6_v292Dfix135_last_slot_': 'c', 'chr6_v292Dfix136_wi_slot_': 'c', 'chr6_v292Dfix137_ev_slot_': 'c',   /* 長期記憶（AI 生成） */
    'v292Dfix277Quasi_slot_': 'c', 'v292Dfix298_slot_': 'c',   /* 準登録カルテ・ロスター（手動の退場を含む） */
    'v292capp_slot_': 'c',                   /* 正典の外見（一度決めたら固定する値） */
    'v292Dmem1_slot_': 'c',                  /* Memory Engine（HOME では fix793 が無く projectionV2 に入らない） */
    'v292Dav2_reg_': 'c', 'v292Dav2_mig_': 'c'    /* 登録の結果待ち／移行の記録 */
  };
  function familyClass(fam) { return Object.prototype.hasOwnProperty.call(FAMILY_CLASS, fam) ? FAMILY_CLASS[fam] : 'c'; }

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
  /* ★STUCK1 r2: 印が DIRTY だった物語（dirtyProven）で消してよいキーだけ（a / b）。c が 1 本でも残るなら同期の印も残す。
     pl は planOne / planP の計画（keys / vals）。返り値 { keys, vals, chars, keptC, keptCChars, markerKept } */
  function provenSubset(id, env, pl) {
    var K = env.key1, out = { keys: [], vals: [], chars: 0, keptC: 0, keptCChars: 0, markerKept: false }, mkK = 'v292Dfix402_f781g_' + id, mi = -1;
    for (var i = 0; i < pl.keys.length; i++) {
      var k = pl.keys[i]; if (k === mkK) { mi = i; continue; }
      var s = K && K.storyOf(k), cls = s ? familyClass(s.family) : 'c', v = pl.vals ? pl.vals[i] : null;
      if (cls === 'a' || cls === 'b') { out.keys.push(k); out.vals.push(v); out.chars += k.length + (v == null ? 0 : v.length); }
      else { out.keptC++; out.keptCChars += k.length + (v == null ? 0 : v.length); }
    }
    if (env.free2 === true && g(env, 'v292Dfix402_f697p_' + id) != null) { out.keptC++; out.keptCChars += ('v292Dfix402_f697p_' + id).length + g(env, 'v292Dfix402_f697p_' + id).length; }   /* ★FREE2: 送信の記録が残る → 同期の印も残す */
    if (mi >= 0) {
      if (out.keptC) out.markerKept = true;
      else { var mv = pl.vals ? pl.vals[mi] : null; out.keys.push(mkK); out.vals.push(mv); out.chars += mkK.length + (mv == null ? 0 : mv.length); }
    }
    return out;
  }
  function applySubset(pl, sub) { var q = {}; for (var k in pl) if (Object.prototype.hasOwnProperty.call(pl, k)) q[k] = pl[k];
    q.keys = sub.keys; q.vals = sub.vals; q.chars = sub.chars; q.keptC = sub.keptC; q.keptCChars = sub.keptCChars; q.markerKept = sub.markerKept; return q; }
  /* ★STUCK1 r2: 消す直前の確かめ直し（ほかのタブの書き込み・meta の墓標の行）。env.stuck1 のときだけ */
  function tombStr(id, env) { var m = metaRows(env); if (!m) return null; var o = null, n = 0; for (var i = 0; i < m.length; i++) if (m[i] && String(m[i].id) === id) { n++; o = m[i]; } return n === 1 ? stable(o) : null; }
  function raceProbe(id, env) { if (env.stuck1 !== true) return null; return { seq: typeof env.otherTab === 'function' ? env.otherTab(id) : null, tomb: tombStr(id, env) }; }
  function raceBlock(id, env, rp) {
    if (!rp) return null;
    if (typeof env.otherTab === 'function' && env.otherTab(id) !== rp.seq) return 'other-tab-write';
    var t = tombStr(id, env); if (t == null || t !== rp.tomb) return 'meta-changed';
    return null;
  }

  /* ---- ローカルの関門（L1〜L6）。理由コード。null = 通過 ---- */
  function metaRows(env) { var a = J(g(env, 'chr6_slots_meta') || '[]', null); return isArr(a) ? a : null; }
  /* ★STUCK1: 印が DIRTY_INTENT / DIRTY_LOCAL でも、L6 の判断をサーバーの内容の確認（stuckProof）へ回してよいか（ローカルの条件だけ） */
  function staleDirtyLocal(id, env, row, mo) {
    if (env.stuck1 !== true || typeof env.dirtyProof !== 'function') return false;
    if (!mo || typeof mo !== 'object' || STALE_DIRTY[String(mo.state || '')] !== 1) return false;
    if (mo.inFlightSave) return false;
    if (mo.storyId != null && String(mo.storyId) !== id) return false;
    var st = row && row.serverTombstone;
    if (!st || typeof st !== 'object' || typeof st.at !== 'number' || !(st.at > 0)) return false;   /* サーバーで確かめて立てた墓標だけ（fix587 dl2ApplyLocked） */
    if (st.localState == null || String(st.localState) !== String(mo.state)) return false;          /* 削除の時点で同じ DIRTY だった（DL2 の確認シートで警告を見て削除した／DP1）ものだけ */
    if (typeof mo.updatedAt === 'number' && mo.updatedAt > st.at) return false;                     /* 削除より後に印が書かれた＝削除後の変更 */
    if (typeof row.title !== 'string') return false;                                                 /* サーバーの title と突き合わせる値（fix579 make） */
    return true;
  }
  /* ★ZT1: 0 ターンの本体で、印が DIRTY_INTENT / DIRTY_LOCAL のまま削除された物語を、墓標の hash の確認へ回してよいか（ローカルの条件だけ） */
  function zt1DirtyLocal(id, env, row, mo) {
    if (env.zt1 !== true || typeof env.dirtyProof !== 'function') return false;
    if (!mo || typeof mo !== 'object' || STALE_DIRTY[String(mo.state || '')] !== 1) return false;
    if (mo.inFlightSave) return false;
    if (mo.storyId != null && String(mo.storyId) !== id) return false;
    var st = row && row.serverTombstone;
    if (!st || typeof st !== 'object' || typeof st.at !== 'number' || !(st.at > 0)) return false;
    if (typeof mo.updatedAt === 'number' && mo.updatedAt > st.at) return false;
    if (typeof row.title !== 'string') return false;
    var b = J(g(env, 'chr6_slot_' + id), null);
    return !!(b && typeof b === 'object' && !isArr(b) && isArr(b.turns) && b.turns.length === 0);
  }
  function zt1Row(id, env) { var m = metaRows(env) || []; for (var i = 0; i < m.length; i++) if (m[i] && String(m[i].id) === id && m[i].deleted === true) return m[i]; return null; }
  /* ★FREE2: 削除の時点の証明（DL2 が残す）があり、印がその時から変わっていない物語か。返すのは証明（{h,rev,...}）か null。
     読むのは証明の表・印・meta の墓標の行だけ（本文は読まない）。 */
  function free2Proof(id, env, row, mkRaw, mo) {
    if (env.free2 !== true || typeof env.dirtyProof !== 'function') return null;
    if (mkRaw == null || !mo || typeof mo !== 'object' || STALE_DIRTY[String(mo.state || '')] !== 1) return null;   /* DIVERGED / BOOTSTRAP_HOLD は対象外 */
    if (mo.storyId != null && String(mo.storyId) !== id) return null;
    var st = row && row.serverTombstone;
    if (!st || typeof st !== 'object' || typeof st.at !== 'number' || !(st.at > 0) || st.source !== 'dl2-delete') return null;   /* 公式の削除シートで、サーバーを確かめて立てた墓標だけ */
    var all = J(g(env, F2_KEY), null); if (!all || typeof all !== 'object' || isArr(all)) return null;
    var p = Object.prototype.hasOwnProperty.call(all, id) ? all[id] : null;
    if (!p || typeof p !== 'object' || p.v !== 1 || !HEX64.test(String(p.h || '')) || typeof p.rev !== 'number' || typeof p.mk !== 'string') return null;
    if (p.rev !== st.rev) return null;                    /* 証明は、この墓標を立てた削除のもの */
    if (p.mk !== h53(mkRaw)) return null;                 /* 印が証明の時から 1 文字でも変わった */
    /* 送信の記録 f697p（その時の送信の控え）: 証明の時にあったものが 1 文字も変わらず残っている／その時に無く今も無い のどちらかだけ */
    var jr = g(env, 'v292Dfix402_f697p_' + id);
    if (jr == null ? (p.jr != null) : (typeof p.jr !== 'string' || p.jr !== h53(jr))) return null;
    return p;
  }
  /* いま、その物語がサーバーの内容の確認を要るか。要る → 墓標の title / 要らない → null。値を読むのは印と meta だけ */
  function stuckNeeds(id, env) {
    if ((env.stuck1 !== true && env.zt1 !== true && env.free2 !== true) || typeof env.dirtyProof !== 'function') return null;   /* OFF: 1 キーも余計に読まない */
    var mk = g(env, 'v292Dfix402_f781g_' + id); if (mk == null) return null;
    var mo = J(mk, null), row = null, m = metaRows(env) || [];
    for (var i = 0; i < m.length; i++) if (m[i] && String(m[i].id) === id && m[i].deleted === true) { row = m[i]; break; }
    var fp = free2Proof(id, env, row, mk, mo);
    if (fp) return { title: row.title, free2: fp };       /* ★FREE2: 証明つき（STUCK1 / ZT1 の条件より先。証明の hash・rev とも突き合わせる） */
    return (staleDirtyLocal(id, env, row, mo) || zt1DirtyLocal(id, env, row, mo)) ? { title: row.title } : null;
  }
  /* サーバーの墓標の hash とこの端末の内容が同じか。null = 確認不要か一致 / 理由コード = 一致を確かめられない */
  function stuckProof(id, env, se) {
    var need = stuckNeeds(id, env);
    if (!need && se && se.zeroTurn === true) {   /* ★ZT1: 印が CLEAN でも 0 ターンの墓標は hash の一致を必ず確かめる（dirtyProven にはしない） */
      var zr = zt1Row(id, env);
      if (!zr || typeof zr.title !== 'string' || !HEX64.test(String(se.serverHash || ''))) return Promise.resolve('zero-turn-unproven');
      return Promise.resolve().then(function () { return env.dirtyProof(id, zr.title, String(se.serverHash), dpo(se)); })
        .then(function (why) { if (why == null) { se.zeroTurnProven = true; return null; } return 'zero-turn-unproven'; }, function () { return 'zero-turn-unproven'; });
    }
    if (!need) return Promise.resolve(null);
    if (!HEX64.test(String(se && se.serverHash || ''))) return Promise.resolve('unsynced-unproven');
    if (need.free2) {   /* ★FREE2: サーバーの墓標が証明の時のまま（hash・rev）で、いまの端末の全体がその hash と同じ。title はサーバーの墓標のもの */
      if (String(se.serverHash) !== need.free2.h || se.rev !== need.free2.rev || typeof se.title !== 'string') return Promise.resolve('unsynced-unproven');
      return Promise.resolve().then(function () { return env.dirtyProof(id, se.title, String(se.serverHash), dpo(se)); })
        .then(function (why) { if (why == null) { se.dirtyProven = true; se.free2 = true; return null; } return 'unsynced-unproven'; }, function () { return 'unsynced-unproven'; });   /* (dirtyProof の第 4 引数は下で付ける) */
    }
    return Promise.resolve().then(function () { return env.dirtyProof(id, need.title, String(se.serverHash), dpo(se)); })
      .then(function (why) { if (why == null) { se.dirtyProven = true; if (se.zeroTurn === true) se.zeroTurnProven = true; return null; } return se.zeroTurn === true ? 'zero-turn-unproven' : 'unsynced-unproven'; }, function () { return se.zeroTurn === true ? 'zero-turn-unproven' : 'unsynced-unproven'; });
  }
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
    /* ★FREE2: chr6_active_slot は「最後に開いた物語」の写し（fix527 の互換ミラー）で、物語を削除しても次に別の物語を開くまで残る
       （実測: 削除した直後の試験物語が、この理由でシートに出なかった）。サーバーで確かめて立てた墓標（serverTombstone）のある物語は
       もう開けない（fix527 は墓標の id をミラーへ書かない・fix588）ので、FREE2 が ON のときは理由にしない。
       「いま開いているか」は今までどおり Web Lock chronicle:story-open:<id>（一覧では query、消す時は exclusive で取る）と lastOpenedAt 10 分で見る。 */
    var f2stale = env.free2 === true && !!(row && row.serverTombstone && typeof row.serverTombstone === 'object' && typeof row.serverTombstone.at === 'number' && row.serverTombstone.at > 0);
    if (act != null && (act === id || J(act, null) === id) && !f2stale) return 'active-slot';
    var lo = row && row.lastOpenedAt ? Date.parse(row.lastOpenedAt) : 0;
    if (lo && env.now() - lo < RECENT_OPEN_MS) return 'recently-opened';
    var mk = g(env, 'v292Dfix402_f781g_' + id);                            /* L6 */
    if (mk != null) {
      var mo = J(mk, null); if (!mo || typeof mo !== 'object') return 'marker-unreadable';
      var f2p = free2Proof(id, env, row, mk, mo);   /* ★FREE2（OFF: 何も読まず null） */
      if (UNSYNCED_STATES[String(mo.state || '')] === 1 && !f2p && !staleDirtyLocal(id, env, row, mo) && !zt1DirtyLocal(id, env, row, mo)) return 'unsynced';   /* ★STUCK1: 回したものは stuckProof で確かめる */
      if (mo.inFlightSave && !f2p) return 'in-flight';   /* ★FREE2: 削除の時から変わっていない送信中の印は、墓標の hash との一致で確かめる（サーバーの行は墓標＝その送信はもう着地しない） */
      if (mo.storyId != null && String(mo.storyId) !== id) return 'marker-id-mismatch';
    }
    if (g(env, 'v292Dfix402_f911_' + id) != null) return 'stash';
    /* ★FREE2: 削除の時から変わっていない送信の記録は、その時の端末の全体＝サーバーの墓標 と証明済み（送ろうとした内容はもうサーバーにある）。
       消す時点でもう一度 hash を突き合わせる。記録そのものは消さない（同期の印と一緒に残す）。f911・rescue は今までどおり止める。 */
    if (g(env, 'v292Dfix402_f697p_' + id) != null && !(env.free2 === true && mk != null && free2Proof(id, env, row, mk, J(mk, null)))) return 'journal';
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
    if (isArr(env.only)) out = out.filter(function (x) { return env.only.indexOf(x) >= 0; });   /* ★STUCK1 explain(id): その 1 件だけ */
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
  function serverEval(id, r, pl, env) {
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
    /* ★ZT1: サーバーの墓標も端末の本体も 0 ターン → 本文の一致は自明。全体の一致（hash）は stuckProof が必ず確かめる */
    if (env && env.zt1 === true && rec && rec.deleted === true && b && isArr(b.turns) && b.turns.length === 0 && pl && pl.body === 'present' && isArr(pl.tstr) && pl.tstr.length === 0)
      return { why: null, rev: j.rev, authority: j.authority, serverTurns: 0, localTurns: 0, digest: h53(''), serverHash: j.serverHash, zeroTurn: true };
    if (!rec || rec.deleted !== true || !b || !isArr(b.turns) || b.turns.length < 1) return { why: 'server-body-not-held' };
    /* R1②: 端末のターンが全部、同じ位置に同じ内容で（canonical 文字列が 1 文字も違わずに）サーバーにある */
    var loc = (pl && pl.body === 'present' && isArr(pl.tstr)) ? pl.tstr : [];
    if (pl && pl.body === 'present' && !isArr(pl.tstr)) return { why: 'local-body-unreadable' };
    if (b.turns.length < loc.length) return { why: 'server-body-behind' };
    var dig = [];
    try { for (var i = 0; i < loc.length; i++) { var sv = stable(b.turns[i]); if (sv !== loc[i]) return { why: 'content-mismatch' }; dig.push(h53(sv)); } }
    catch (eC) { return { why: 'content-mismatch' }; }
    var seOut = { why: null, rev: j.rev, authority: j.authority, serverTurns: b.turns.length, localTurns: loc.length, digest: h53(dig.join(',')), serverHash: j.serverHash };
    if (env && env.free2 === true && typeof rec.title === 'string') seOut.title = rec.title;
    if (env && env.free2 === true && env.free2d === true) seOut.memKey = !!(rec.sidecar && typeof rec.sidecar === 'object' && Object.prototype.hasOwnProperty.call(rec.sidecar, 'memoryV1'));   /* ★FREE2d */   /* ★FREE2: 墓標の title（hash の入力。ログ・proof には入れない） */
    return seOut;
  }

  /* ★FREE2c: 公式の削除シートで立てた墓標の物語は、印が CLEAN でも「この端末の全体＝サーバーの墓標の hash」を確かめる（FREE2 のときだけ）。
     null = 通過（確認が要らない古い墓標・証明つきで確認済み・一致）／理由コード */
  function dpo(se) { return (se && se.memKey === true) ? { mem: true } : undefined; }   /* ★FREE2d: サーバーの行が memoryV1 を持つ */
  function tombHashCheck(id, env, se) {
    if (env.free2 !== true) return Promise.resolve(null);                         /* kill: 何も読まない */
    if (se.dirtyProven === true || se.zeroTurnProven === true) return Promise.resolve(null);   /* もう同じ hash で確かめた */
    var row = zt1Row(id, env), st = row && row.serverTombstone;
    if (!st || typeof st !== 'object' || st.source !== 'dl2-delete') return Promise.resolve(null);   /* FREE2 より前の形の墓標: r2 の規則（ターンの一致）のまま */
    if (typeof env.dirtyProof !== 'function' || !HEX64.test(String(se.serverHash || '')) || typeof se.title !== 'string') return Promise.resolve('tomb-hash-unproven');
    return Promise.resolve().then(function () { return env.dirtyProof(id, se.title, String(se.serverHash), dpo(se)); })
      .then(function (why) { if (why == null) { se.tombHashMatched = true; return null; } return why === 'content-differs' ? 'tomb-hash-mismatch' : 'tomb-hash-unproven'; }, function () { return 'tomb-hash-unproven'; });
  }
  /* ★FREE2c: 1 物語の判定（シート・dry-run・explain・実行が同じ関数を通る）。ローカルの関門（localBlock）を通った物語だけで呼ぶ。
     opt.inLock = 実行（その物語の Lock を exclusive で持っている）: Lock の query は飛ばす。opt.pl0 = 計画と同じか（実行のとき）。
     返り値 { why } か { why:null, pl, pq, se }（pq = 実際に消すキー）。何も消さない・書かない */
  function judgeOne(id, env, ctx, opt) {
    opt = opt || {};
    var pl = planOne(id, env);
    if (opt.pl0) { var sp = samePlan(opt.pl0, pl); if (sp) return Promise.resolve({ why: sp }); }
    if (!pl.keys.length) return Promise.resolve({ why: 'nothing-left' });
    var bb = bodyBlock(pl); if (bb) return Promise.resolve({ why: bb });
    if (env.free2 === true && typeof env.saveBusy === 'function') { var sb = true; try { sb = !!env.saveBusy(id); } catch (eB) { sb = true; } if (sb) return Promise.resolve({ why: 'in-flight' }); }
    return Promise.resolve(ctx.getStory(id)).then(function (r) {
      var se = serverEval(id, r, pl, env);
      if (se.why) return { why: se.why };
      return stuckProof(id, env, se).then(function (pw) {
        if (pw) return { why: pw };
        return tombHashCheck(id, env, se).then(function (tw) {
          if (tw) return { why: tw };
          var pq = se.dirtyProven === true ? applySubset(pl, provenSubset(id, env, pl)) : pl;   /* ★STUCK1 r2: c は残す */
          if (!pq.keys.length) return { why: 'nothing-left' };
          if (opt.inLock) return { why: null, pl: pl, pq: pq, se: se };
          return Promise.resolve(ctx.lockHeld(id)).then(function (h) {
            if (h !== false) return { why: h === true ? 'open-in-tab' : 'locks-unavailable' };
            return { why: null, pl: pl, pq: pq, se: se };
          });
        });
      });
    }, function () { return { why: 'server-unreachable' }; });
  }

  /* ★FREE2d: 本文を持たない墓標の覚え（この画面のメモリだけ・meta の墓標の行が 1 文字でも変われば無効） */
  var SURVEY_PAR = 4, MEMO = {};
  function memoGet(id, env) { var m = MEMO[id]; if (!m) return null; var t = tombStr(id, env); return (t != null && t === m.t) ? m.why : null; }
  function memoSet(id, env, why) { var t = tombStr(id, env); if (t != null) MEMO[id] = { t: t, why: why }; }

  /* ---- 一覧（何も消さない）: 候補ごとに L1〜L6 → 計画 → getstory → Lock の確認、前後の accountId ---- */
  function survey(env, ctx) {
    var rep = { at: env.now(), v: VERSION, kind: 'survey', candidates: 0, eligible: [], skipped: {}, totals: { stories: 0, keys: 0, chars: 0, snapshotsKept: 0, backupKept: 0, unknownKept: 0 } };
    function skp(sid, w) { bump(rep.skipped, w); if (typeof env.onReason === 'function') { try { env.onReason(sid, w); } catch (eR) {} } }   /* ★STUCK1 r2: planByReason だけが使う（無ければ従来と同じ） */
    var gb = globalBlock(env);
    if (gb) { skp('*', gb); return Promise.resolve(rep); }
    var ids = candidates(env), pass = [];
    rep.candidates = ids.length;
    for (var i = 0; i < ids.length; i++) { var w = localBlock(ids[i], env); if (w) { skp(ids[i], w); continue; } pass.push(ids[i]); }
    if (!pass.length) return Promise.resolve(rep);
    return Promise.resolve(ctx.who()).then(function (a0) {
      if (!a0) { skp('*', 'no-account'); return rep; }
      var rows = [], chain = Promise.resolve();
      function rowOf(id, x) { var pl = x.pl, pq = x.pq, se = x.se;
        var o = { id: id, title: titleOf(id, env), turns: pl.turns, keys: pq.keys.length, chars: pq.chars, snapshots: pl.snapshots, backupKept: pl.backupKept, unknownKept: pl.unknownKept, serverRev: se.rev, authority: se.authority, dirtyProven: se.dirtyProven === true };
        if (se.dirtyProven === true) o.keptC = pq.keptC; return o; }
      if (env.free2 === true && env.free2d === true) {   /* ★FREE2d: 覚えた墓標は飛ばす・getstory は最大 4 本同時・結果は候補の順 */
        var res = new Array(pass.length), next = 0;
        function worker() { if (next >= pass.length) return Promise.resolve(); var i = next++, id = pass[i];
          var mw = memoGet(id, env); if (mw) { res[i] = { why: mw }; return worker(); }
          return judgeOne(id, env, ctx).then(function (x) { res[i] = x; if (x && x.why === 'server-body-not-held') memoSet(id, env, x.why); }, function () { res[i] = { why: 'server-unreachable' }; }).then(worker); }
        var ws = []; for (var w = 0; w < Math.min(SURVEY_PAR, pass.length); w++) ws.push(worker());
        chain = Promise.all(ws).then(function () { for (var j = 0; j < pass.length; j++) { var x = res[j] || { why: 'server-unreachable' }; if (x.why) skp(pass[j], x.why); else rows.push(rowOf(pass[j], x)); } });
      } else
      pass.forEach(function (id) {
        chain = chain.then(function () {
          return judgeOne(id, env, ctx).then(function (x) {   /* ★FREE2c: 判定は judgeOne（実行と同じ）。kill のときも同じ順の確かめ（FREE2 の項目は飛ばす） */
            if (x.why) { skp(id, x.why); return; }
            rows.push(rowOf(id, x));
          });
        });
      });
      return chain.then(function () { return ctx.who(); }).then(function (a1) {
        if (!a1 || a1 !== a0) { rep.eligible = []; skp('*', 'principal-changed'); return rep; }
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
    var rp = raceProbe(id, env);                                       /* ★STUCK1 r2（OFF: null・何も読まない） */
    function syncDelete(a0, a2, se, issuedAt) {
      /* materialization も持っている。ここから先は同期だけ（await なし） */
      var gb3 = globalBlock(env) || localBlock(id, env); if (gb3) return fin(gb3);
      var now3 = planOne(id, env), sp3 = samePlan(pl, now3); if (sp3) return fin(sp3);
      var rb3 = raceBlock(id, env, rp); if (rb3) return fin(rb3);       /* ★STUCK1 r2: 消す直前（同期・2 つの Lock の中） */
      if (se.dirtyProven === true) { pl = applySubset(pl, provenSubset(id, env, pl)); if (!pl.keys.length) return fin('nothing-left'); out.keptC = pl.keptC; out.markerKept = pl.markerKept; }
      var I = env.inv, G = env.gate;
      if (!I || typeof I.deletePolicy !== 'function' || typeof I.store1Arm !== 'function' || typeof I.store1Disarm !== 'function' || typeof I._hash !== 'function') return fin('policy-unavailable');
      if (!G || typeof G.tryDeleteExact !== 'function') return fin('gate-unavailable');
      var proof = { v: 2, kind: 'STORE1', runId: 's1b-' + issuedAt + '-' + (++runSeq), storyId: id, accountId: a0, accountIdAfter: a2,
                    serverRev: se.rev, serverDeleted: true, authority: se.authority, serverBodyHeld: true, issuedAt: issuedAt,
                    contentMatched: true, localTurns: se.localTurns, serverTurns: se.serverTurns, contentDigest: se.digest, dirtyProven: se.dirtyProven === true,
                    zeroTurnProven: (se.zeroTurn === true && se.zeroTurnProven === true) ? true : undefined,
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
      out.turnsMatched = se.localTurns; out.dirtyProven = se.dirtyProven === true;
      return fin('freed');
    }
    function underOpenLockJ(a0) {   /* ★FREE2c: Lock の中の判定はシート・dry-run と同じ judgeOne（Lock の query の代わりに、いま持っている exclusive Lock） */
      return Promise.resolve(ctx.who()).then(function (a1) {
        if (!a1 || a1 !== a0) return fin('principal-changed');
        var gb2 = globalBlock(env) || localBlock(id, env); if (gb2) return fin(gb2);
        return judgeOne(id, env, ctx, { inLock: true, pl0: pl }).then(function (x) {
          if (x.why) return fin(x.why);
          var se = x.se;
          var rb2 = raceBlock(id, env, rp); if (rb2) return fin(rb2);
          var issuedAt = env.now();
          return Promise.resolve(ctx.who()).then(function (a2) {
            if (!a2 || a2 !== a0) return fin('principal-changed');
            return Promise.resolve(ctx.withMatLock(function () { return syncDelete(a0, a2, se, issuedAt); })).then(function (m) {
              if (!m || m.granted !== true) return fin(m && m.api === false ? 'locks-unavailable' : 'lock-busy');
              if (m.threw) return fin('threw');
              return m.value;
            });
          });
        });
      });
    }
    function underOpenLock(a0) {
      if (env.free2 === true) return underOpenLockJ(a0);
      return Promise.resolve(ctx.who()).then(function (a1) {
        if (!a1 || a1 !== a0) return fin('principal-changed');
        var gb2 = globalBlock(env) || localBlock(id, env); if (gb2) return fin(gb2);       /* 墓標・Vault・未送信・開いている印 */
        var now2 = planOne(id, env), sp2 = samePlan(pl, now2); if (sp2) return fin(sp2);
        return Promise.resolve(ctx.getStory(id)).then(function (r) {
          var se = serverEval(id, r, now2, env);                                                 /* サーバーの状態と内容の一致（Lock の中で） */
          if (se.why) return fin(se.why);
          return stuckProof(id, env, se).then(function (pw) {                               /* ★STUCK1: 印が DIRTY のときだけ墓標の hash と突き合わせる（Lock の中で） */
            if (pw) return fin(pw);
            var rb2 = raceBlock(id, env, rp); if (rb2) return fin(rb2);                     /* ★STUCK1 r2 */
            var issuedAt = env.now();
            return Promise.resolve(ctx.who()).then(function (a2) {
              if (!a2 || a2 !== a0) return fin('principal-changed');
              return Promise.resolve(ctx.withMatLock(function () { return syncDelete(a0, a2, se, issuedAt); })).then(function (m) {
                if (!m || m.granted !== true) return fin(m && m.api === false ? 'locks-unavailable' : 'lock-busy');
                if (m.threw) return fin('threw');
                return m.value;
              });
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
      return (env.purge === true ? freeOneP : freeOne)(id, env, ctx).then(function (x) {
        if (x && x.ok) { res.done++; res.removed += x.removed; res.chars += x.chars; res.doneIds.push(id); return next(); }
        res.failed = 1; res.failedCode = (x && x.code) || 'threw'; res.partial = (x && x.removed) || 0; res.removed += res.partial; res.chars += (x && x.chars) || 0;
        res.notProcessed = ids.length - idx; res.code = 'stopped';
        return res;
      });
    }
    return Promise.resolve().then(next);
  }


  /* ======================================================================
   * ★PURGE1 段階 1: 削除済み物語の端末の写しを「全部」消す（env.purge === true のときだけ呼ばれる）
   * ====================================================================== */
  var BK_PRE = 'chr6_bk_';
  function bkOwnedBy(k, id) {      /* 控えのキー名に chr6_slot_<id> が丸ごと 1 語で入っている（名前だけで判定・値は読まない） */
    var i = k.indexOf('chr6_slot_' + id); if (i < 0) return false;
    var nx = k.charAt(i + 10 + id.length); return !nx || !/[A-Za-z0-9]/.test(nx);
  }
  function keysForP(id, env) {
    var r = { side: [], snapMan: [], snapPart: [], backup: [], body: [], unsent: [], marker: [], refused: 0, backupKept: 0, unknownKept: 0 };
    var K = env.key1; if (!K || !ID_RE.test(String(id))) return r;
    var ks = allKeys(env);
    for (var i = 0; i < ks.length; i++) {
      var k = ks[i], s = K.storyOf(k);
      if (s && s.id === id) {
        if (s.kind === 'vault') { r.refused++; continue; }                     /* chr6_storysess_<id>: 関門（passcode）で止まる。ここに来ても消さない */
        if (s.kind === 'snapshot') { (k.indexOf('chr6_snap_') === 0 ? r.snapMan : r.snapPart).push(k); continue; }
        if (s.kind === 'body') r.body.push(k);
        else if (k === 'v292Dfix402_f781g_' + id) r.marker.push(k);
        else if (s.kind === 'sync' || s.kind === 'rescue') r.unsent.push(k);   /* f911 / f697p / 945_rescue: 削除した物語の未送信の写し（完全削除では消す） */
        else r.side.push(k);
        continue;
      }
      if (!K.mentions(k, id)) continue;
      if (k.indexOf(BK_PRE) === 0 && bkOwnedBy(k, id)) { r.backup.push(k); continue; }
      if (k.indexOf(BK_PRE) === 0) r.backupKept++; else r.unknownKept++;      /* 形の分からないキーは消さない（KEY1 の規則のまま） */
    }
    r.side.sort(); r.snapMan.sort(); r.snapPart.sort(); r.backup.sort(); r.unsent.sort();
    return r;
  }
  /* 消す順: サイド → 本体 → snapshot の目録 → snapshot の部品 → その物語だけの控え → 未送信の写し → 同期の印（最後）。
     ★本体が先: fix562.liveSlots は「本体がある物語」を生きていると数え、その物語の最良の snapshot / 控えを protectedSet で守る
       （fix569 tryDeleteExact が 'protected' で断る）。本体を消した後なら、墓標の物語の snapshot / 控えは守られない。
       途中で止まっても墓標は残り、次の実行は本体なしで残りを続ける（planP は本体の有無を問わない）。 */
  function purgeListP(kf) { return kf.side.concat(kf.body, kf.snapMan, kf.snapPart, kf.backup, kf.unsent, kf.marker); }
  function tombRow(id, env) { var m = metaRows(env) || []; for (var i = 0; i < m.length; i++) if (m[i] && String(m[i].id) === id && m[i].deleted === true) return m[i]; return null; }
  /* ローカルの関門（PURGE1）。{ why, blind }。why = null で通過 */
  function localBlockP(id, env) {
    id = String(id);
    if (!ID_RE.test(id)) return { why: 'id-shape' };                     /* a/b/c/default/chr6（値を読まない） */
    if (PROTECT[id] === 1) return { why: 'protected' };
    var vb = vaultBlock(id, env), blind = false;
    if (vb === 'vault' && env.purgeVault === true) blind = true;            /* 裁定 2: 隠した物語の墓標は名前だけで消す（passcode・判定不能は止めたまま） */
    else if (vb) return { why: vb };
    var meta = metaRows(env); if (!meta) return { why: 'meta-unreadable' };
    var tomb = 0, live = 0, row = null;
    for (var i = 0; i < meta.length; i++) { var e = meta[i]; if (!e || String(e.id) !== id) continue; if (e.deleted === true) { tomb++; row = e; } else live++; }
    if (live) return { why: 'live-row' };
    if (tomb !== 1) return { why: tomb ? 'dup-tombstone' : 'no-tombstone' };
    try { if (env.iso2Foreign && env.iso2Foreign(id)) return { why: 'foreign' }; } catch (e3) { return { why: 'foreign-check-threw' }; }
    var act = g(env, 'chr6_active_slot');
    if (act != null && (act === id || J(act, null) === id)) return { why: 'active-slot' };
    var lo = row && row.lastOpenedAt ? Date.parse(row.lastOpenedAt) : 0;
    if (lo && env.now() - lo < RECENT_OPEN_MS) return { why: 'recently-opened' };
    var tombAt = (row && typeof row.deletedAt === 'number') ? row.deletedAt : ((row && row.serverTombstone && typeof row.serverTombstone.at === 'number') ? row.serverTombstone.at : 0);
    if (!blind) {
      /* ★PURGE1c（GPT #127-SK の QA 条件「未送信なし」）: 未送信の変更が残っている物語は消さない（r2 と同じ状態の一覧）。
         墓標より後に書かれた印・送信中も止める */
      var mk = g(env, 'v292Dfix402_f781g_' + id);
      if (mk != null) {
        var mo = J(mk, null); if (!mo || typeof mo !== 'object') return { why: 'marker-unreadable' };
        if (mo.storyId != null && String(mo.storyId) !== id) return { why: 'marker-id-mismatch' };
        if (UNSYNCED_STATES[String(mo.state || '')] === 1 && !staleDirtyLocal(id, env, row, mo)) return { why: 'unsynced' };   /* ★STUCK1 */
        if (mo.inFlightSave) return { why: 'in-flight' };                     /* いま送っている最中（一時的）。終わってから */
        if (typeof mo.updatedAt === 'number' && mo.updatedAt > 0 && tombAt > 0 && mo.updatedAt > tombAt) return { why: 'changed-after-delete' };
      }
    }
    /* 未送信の写し（f911 / f697p / 945_rescue）があれば止める。名前の列挙だけで見る（値は読まない） */
    if (hasKey(env, 'v292Dfix402_f911_' + id)) return { why: 'stash' };
    if (hasKey(env, 'v292Dfix402_f697p_' + id)) return { why: 'journal' };
    if (hasKey(env, 'v292Dfix945_rescue_' + id)) return { why: 'rescue' };
    var cf = g(env, 'v292Dfix587_dl2conflict');
    if (cf != null) { var co = J(cf, null); if (!co || typeof co !== 'object') return { why: 'conflict-unreadable' }; if (Object.prototype.hasOwnProperty.call(co, id)) return { why: 'conflict' }; }
    var mt = g(env, 'v292Dfix750_matTxn');
    if (mt != null) { var to = J(mt, null); if (!to || typeof to !== 'object') return { why: 'mat-journal-unreadable' }; if (String(to.storyId) === id || String(to.slotId) === id) return { why: 'mat-journal' }; }
    var planOpen = 0, pd = g(env, 'v292Dfix587_pending');
    if (pd != null) {
      var pa = J(pd, null); if (!isArr(pa)) return { why: 'pending-unreadable' };
      for (var p = 0; p < pa.length; p++) { var pl = pa[p]; if (pl && (String(pl.slotId) === id || String(pl.storyId || '') === id) && !(pl.sdTerminal === true)) planOpen++; }
    }
    return { why: null, blind: blind, tombAt: tombAt, planOpen: planOpen };   /* 開いた計画は「サーバーで削除済み」と確かめた後なら意味を持たない（数えるだけ） */
  }
  function planP(id, env, blind) {
    var kf = keysForP(id, env), list = purgeListP(kf), vals = null, chars = 0, fullDumpKept = 0;
    if (blind) {                                                            /* 名前だけ。getItem しない（文字数はキー名の分しか数えない） */
      kf.backupKept += kf.backup.length; kf.backup = []; list = purgeListP(kf);   /* 控えは中身を見ないと丸ごと控えか分からない → 残す */
      for (var b = 0; b < list.length; b++) chars += list[b].length;
    } else {
      var keep = [];
      for (var q = 0; q < kf.backup.length; q++) { var bv = J(g(env, kf.backup[q]) || 'null', null); if (bv && typeof bv === 'object' && bv.ls && typeof bv.ls === 'object') { keep.push(kf.backup[q]); fullDumpKept++; } }
      if (keep.length) { kf.backup = kf.backup.filter(function (x) { return keep.indexOf(x) < 0; }); list = purgeListP(kf); }   /* localStorage 丸ごとの控え（ほかの物語も入っている）は消さない */
      vals = [];
      for (var i = 0; i < list.length; i++) { var v = g(env, list[i]); vals.push(v); chars += list[i].length + (v == null ? 0 : v.length); }
    }
    return { id: id, keys: list, vals: vals, chars: chars, blind: !!blind, snapshots: kf.snapMan.length, snapParts: kf.snapPart.length, backups: kf.backup.length,
             unsent: kf.unsent.length, backupKept: kf.backupKept + fullDumpKept, fullDumpKept: fullDumpKept, unknownKept: kf.unknownKept, refused: kf.refused };
  }
  function samePlanP(a, b) {
    if (a.keys.join('\n') !== b.keys.join('\n')) return 'keys-changed';
    if (a.blind) return null;                                              /* 名前だけ: キーの集合が同じこと */
    for (var i = 0; i < a.keys.length; i++) if (a.vals[i] !== b.vals[i]) return 'value-changed';
    return null;
  }
  /* サーバー（PURGE1）: 削除済みであることだけ。本文の保持・内容の一致は見ない（完全削除では意味を持たない） */
  function serverEvalP(id, r) {
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
    return { why: null, rev: j.rev, authority: j.authority, serverBodyHeld: !!(b && isArr(b.turns) && b.turns.length), serverHash: j.serverHash };
  }
  /* 隠した物語: 本文を含まない一覧の行で確かめる（ctx.serverMeta → { status, row }。row = listshadow の 1 行） */
  function serverEvalMeta(id, r) {
    if (!r || typeof r !== 'object' || r.status !== 200) return { why: 'server-unreachable' };
    var x = r.row;
    if (!x) return { why: 'vault-server-unconfirmed' };                   /* 施錠中は隠した行が一覧に出ない＝確かめられない */
    if (String(x.id) !== String(id)) return { why: 'server-id-mismatch' };
    if (x.authority !== 'shadow' && x.authority !== 'canonical') return { why: 'server-authority' };
    if (x.locked) return { why: 'server-locked' };
    if (x.deleted !== true) return { why: 'server-live' };
    if (typeof x.rev !== 'number' || !(x.rev >= 1)) return { why: 'server-rev' };
    return { why: null, rev: x.rev, authority: x.authority, serverBodyHeld: null };
  }
  function askServer(id, ctx, blind) {
    if (blind) { if (typeof ctx.serverMeta !== 'function') return Promise.resolve({ why: 'vault-server-unconfirmed' }); return Promise.resolve(ctx.serverMeta(id)).then(function (r) { return serverEvalMeta(id, r); }, function () { return { why: 'server-unreachable' }; }); }
    return Promise.resolve(ctx.getStory(id)).then(function (r) { return serverEvalP(id, r); }, function () { return { why: 'server-unreachable' }; });
  }
  function surveyP(env, ctx) {
    var rep = { at: env.now(), v: PVERSION, kind: 'survey', purge: true, candidates: 0, eligible: [], skipped: {},
                totals: { stories: 0, blind: 0, keys: 0, chars: 0, snapshots: 0, backups: 0, unsent: 0, planOpen: 0, noServerBody: 0, backupKept: 0, unknownKept: 0 } };
    function skp(sid, w) { bump(rep.skipped, w); if (typeof env.onReason === 'function') { try { env.onReason(sid, w); } catch (eR) {} } }   /* ★STUCK1 r2: planByReason だけが使う（無ければ従来と同じ） */
    var gb = globalBlock(env);
    if (gb) { skp('*', gb); return Promise.resolve(rep); }
    var ids = candidates(env), pass = [];
    rep.candidates = ids.length;
    for (var i = 0; i < ids.length; i++) { var w = localBlockP(ids[i], env); if (w.why) { skp(ids[i], w.why); continue; } pass.push({ id: ids[i], lb: w }); }
    if (!pass.length) return Promise.resolve(rep);
    return Promise.resolve(ctx.who()).then(function (a0) {
      if (!a0) { skp('*', 'no-account'); return rep; }
      var rows = [], chain = Promise.resolve();
      pass.forEach(function (c) {
        chain = chain.then(function () {
          var pl = planP(c.id, env, c.lb.blind);
          if (!pl.keys.length) { skp(c.id, 'nothing-left'); return; }
          return askServer(c.id, ctx, c.lb.blind).then(function (se) {
            if (se.why) { skp(c.id, se.why); return; }
            return (c.lb.blind ? Promise.resolve(null) : stuckProof(c.id, env, se)).then(function (pw) {   /* ★STUCK1（隠した物語は値を読まない＝印を見ない） */
            if (pw) { skp(c.id, pw); return; }
            if (se.dirtyProven === true && env.stuck1 === true) { skp(c.id, 'purge-dirty-hold'); return; }   /* ★STUCK1 r2: 完全削除（snapshot・控えまで）は DIRTY だった物語では証明が足りない */
            return Promise.resolve(ctx.lockHeld(c.id)).then(function (h) {
              if (h !== false) { skp(c.id, h === true ? 'open-in-tab' : 'locks-unavailable'); return; }
              rows.push({ id: c.id, title: c.lb.blind ? null : titleOf(c.id, env), blind: pl.blind, keys: pl.keys.length, chars: pl.chars, snapshots: pl.snapshots, backups: pl.backups, unsent: pl.unsent,
                          planOpen: c.lb.planOpen, serverBodyHeld: se.serverBodyHeld, backupKept: pl.backupKept, unknownKept: pl.unknownKept, serverRev: se.rev, authority: se.authority, dirtyProven: se.dirtyProven === true });
            });
            });
          });
        });
      });
      return chain.then(function () { return ctx.who(); }).then(function (a1) {
        if (!a1 || a1 !== a0) { rep.eligible = []; skp('*', 'principal-changed'); return rep; }
        rep.eligible = rows;
        rows.forEach(function (x) { var t = rep.totals; t.stories++; if (x.blind) t.blind++; t.keys += x.keys; t.chars += x.chars; t.snapshots += x.snapshots; t.backups += x.backups; t.unsent += x.unsent;
          if (x.planOpen) t.planOpen++; if (x.serverBodyHeld === false) t.noServerBody++; t.backupKept += x.backupKept; t.unknownKept += x.unknownKept; });
        return rep;
      });
    });
  }
  function freeOneP(id, env, ctx) {
    id = String(id);
    var out = { ok: false, code: null, id: id, removed: 0, chars: 0, purge: true, blind: false };
    function fin(code) { out.code = code; return out; }
    var gb = globalBlock(env); if (gb) return Promise.resolve(fin(gb));
    var lb = localBlockP(id, env); if (lb.why) return Promise.resolve(fin(lb.why));
    var blind = out.blind = !!lb.blind;
    var pl = planP(id, env, blind);
    if (!pl.keys.length && !tombTitled(id, env)) return Promise.resolve(fin('nothing-left'));   /* 題名だけ残っている（前回が題名を消す直前で止まった）なら、同じ関門で題名だけ消す */
    var rp = blind ? null : raceProbe(id, env);                        /* ★STUCK1 r2（隠した物語は値を読まない＝対象外） */
    function syncDelete(a0, a2, se, issuedAt) {
      var gb3 = globalBlock(env); if (gb3) return fin(gb3);
      var lb3 = localBlockP(id, env); if (lb3.why) return fin(lb3.why); if (!!lb3.blind !== blind) return fin('vault-state-changed');
      var now3 = planP(id, env, blind), sp3 = samePlanP(pl, now3); if (sp3) return fin(sp3);
      var rb3 = raceBlock(id, env, rp); if (rb3) return fin(rb3);       /* ★STUCK1 r2 */
      var I = env.inv, G = env.gate;
      if (!I || typeof I.deletePolicy !== 'function' || typeof I.purge1Arm !== 'function' || typeof I.purge1Disarm !== 'function' || typeof I._hash !== 'function') return fin('policy-unavailable');
      if (!G || typeof G.tryDeleteExact !== 'function') return fin('gate-unavailable');
      var proof = { v: 1, kind: 'PURGE1', mode: blind ? 'blind' : 'full', runId: 'p1-' + issuedAt + '-' + (++runSeq), storyId: id, accountId: a0, accountIdAfter: a2,
                    serverRev: se.rev, serverDeleted: true, authority: se.authority, issuedAt: issuedAt, dirtyProven: se.dirtyProven === true,
                    keys: pl.keys.map(function (k, j) { return blind ? { key: k } : { key: k, bytes: pl.vals[j].length, hash: I._hash(pl.vals[j]), value: pl.vals[j] }; }) };
      var armed = I.purge1Arm(proof);
      if (!armed) return fin('arm-refused');
      var intent = blind ? 'purge-blind' : 'purge-full';
      /* ★PURGE1c（#127-SK Q12）: 本文などが全部消えたら、最後の同期の印を消す前に meta の墓標の題名を '' にする（同じ 2 つの Lock の中）。
         途中で止まっても、印が残る＝次の実行が続きと題名を片づける。印が無い物語はループの最後に消す */
      var markerK = 'v292Dfix402_f781g_' + id, lastQ = pl.keys.length - 1, tb = null;
      function titleStep() { if (tb == null) { tb = blankTomb(id, env); out.title = tb; } return tb === 'blanked' || tb === 'already'; }
      try {
        for (var q = 0; q < pl.keys.length; q++) {
          var k = pl.keys[q], cur;
          if (q === lastQ && k === markerK && !titleStep()) return fin('title-write-failed');
          if (blind) {
            if (!hasKey(env, k)) continue;                                  /* 名前の列挙だけで在るかを見る（getItem しない） */
            var polB = I.deletePolicy({ key: k, intent: intent, purge1Proof: armed });
            if (!polB || polB.allow !== true || polB.code !== 'purge-verified-blind') { out.policyWhy = polB && (polB.purgeWhy || polB.code); return fin('policy-refused'); }
            var bb = polB.binding || {};
            if (bb.key !== k || bb.storyId !== id || bb.runId !== armed.runId) return fin('binding-mismatch');
            var rb = null; try { rb = G.tryDeleteExact({ key: k, expectedBytes: null, expectedHash: null, intent: intent, path: 'PURGE1', reason: 'purge-blind story=' + id }); } catch (eB) { rb = null; }
            if (!rb || rb.ok !== true || rb.deleted !== true || hasKey(env, k)) { out.gateCode = rb && rb.code; return fin('gate-refused'); }
            out.removed++; out.chars += k.length;
            continue;
          }
          cur = g(env, k);
          if (cur == null) continue;
          if (cur !== pl.vals[q]) return fin('value-changed-mid');
          var pol = I.deletePolicy({ key: k, value: cur, intent: intent, purge1Proof: armed });
          if (!pol || pol.allow !== true || pol.code !== 'purge-verified-full') { out.policyWhy = pol && (pol.purgeWhy || pol.code); return fin('policy-refused'); }
          var b = pol.binding || {};
          if (b.key !== k || b.bytes !== cur.length || b.hash !== I._hash(cur) || b.storyId !== id || b.runId !== armed.runId) return fin('binding-mismatch');
          var rr = null; try { rr = G.tryDeleteExact({ key: k, expectedBytes: cur.length, expectedHash: b.hash, intent: intent, path: 'PURGE1', reason: 'purge-full story=' + id }); } catch (eG) { rr = null; }
          if (!rr || rr.ok !== true || rr.deleted !== true || g(env, k) != null) { out.gateCode = rr && rr.code; return fin('gate-refused'); }
          out.removed++; out.chars += k.length + cur.length;
        }
        if (!titleStep()) return fin('title-write-failed');
      } finally { try { I.purge1Disarm(); } catch (eD) {} }
      out.ok = true; out.snapshots = pl.snapshots; out.backups = pl.backups; out.unsent = pl.unsent; out.backupKept = pl.backupKept; out.unknownKept = pl.unknownKept; out.planOpen = lb.planOpen;
      return fin('purged');
    }
    function underOpenLock(a0) {
      return Promise.resolve(ctx.who()).then(function (a1) {
        if (!a1 || a1 !== a0) return fin('principal-changed');
        var gb2 = globalBlock(env); if (gb2) return fin(gb2);
        var lb2 = localBlockP(id, env); if (lb2.why) return fin(lb2.why); if (!!lb2.blind !== blind) return fin('vault-state-changed');
        var now2 = planP(id, env, blind), sp2 = samePlanP(pl, now2); if (sp2) return fin(sp2);
        return askServer(id, ctx, blind).then(function (se) {
          if (se.why) return fin(se.why);
          return (blind ? Promise.resolve(null) : stuckProof(id, env, se)).then(function (pw) {   /* ★STUCK1 */
            if (pw) return fin(pw);
            var rb2 = raceBlock(id, env, rp); if (rb2) return fin(rb2);                     /* ★STUCK1 r2 */
            if (se.dirtyProven === true && env.stuck1 === true) return fin('purge-dirty-hold');   /* ★STUCK1 r2 */
            var issuedAt = env.now();
            return Promise.resolve(ctx.who()).then(function (a2) {
              if (!a2 || a2 !== a0) return fin('principal-changed');
              return Promise.resolve(ctx.withMatLock(function () { return syncDelete(a0, a2, se, issuedAt); })).then(function (m) {
                if (!m || m.granted !== true) return fin(m && m.api === false ? 'locks-unavailable' : 'lock-busy');
                if (m.threw) return fin('threw');
                return m.value;
              });
            });
          });
        });
      });
    }
    return Promise.resolve(ctx.who()).then(function (a0) {
      if (!a0) return fin('no-account');
      return Promise.resolve(ctx.lockHeld(id)).then(function (h) {
        if (h !== false) return fin(h === true ? 'open-in-tab' : 'locks-unavailable');
        return Promise.resolve(ctx.withOpenLock(id, function () { return underOpenLock(a0); })).then(function (x) {
          if (!x || x.granted !== true) return fin(x && x.api === false ? 'locks-unavailable' : 'open-in-tab');
          if (x.threw) return fin(out.code && out.code !== 'purged' ? out.code : 'threw');
          return x.value;
        });
      });
    }).then(null, function () { return fin('threw'); });
  }
  function hasKey(env, k) { var n = env.ls.length; for (var i = 0; i < n; i++) if (env.ls.key(i) === k) return true; return false; }
  /* ★PURGE1c: meta の墓標（ちょうど 1 行）の題名を '' にし、片づけた時刻 purgedAt を足す。id・deleted・deletedAt・deleteOpId・
     recoverySnapshotId・lifecycleVersion・serverTombstone は変えない（Worker の forceput 墓標保護が完全一致を見る 3 項目を含む）。
     返り値: 'blanked' | 'already'（もう題名が無い）| 'meta-unreadable' | 'tomb-not-unique' | 'write-failed' */
  function tombTitled(id, env) { var r = tombRow(id, env); return !!(r && ((r.title != null && r.title !== '') || (r.name != null && r.name !== ''))); }
  function blankTomb(id, env) {
    var a = metaRows(env); if (!a) return 'meta-unreadable';
    var n = 0, ix = -1;
    for (var i = 0; i < a.length; i++) if (a[i] && String(a[i].id) === id) { n++; if (a[i].deleted === true) ix = i; }
    if (n !== 1 || ix < 0) return 'tomb-not-unique';
    var e = a[ix], ch = false;
    if (e.title != null && e.title !== '') { e.title = ''; ch = true; }
    if (e.name != null && e.name !== '') { e.name = ''; ch = true; }
    if (!ch) return 'already';
    if (typeof e.purgedAt !== 'number') e.purgedAt = env.now();
    try { env.ls.setItem('chr6_slots_meta', JSON.stringify(a)); } catch (eW) { return 'write-failed'; }
    return 'blanked';
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
      /* ★FREE2c: 切り分け用（数だけ）。その物語の Lock を持っている数・待っている数・mode ごとの数 */
      lockInfo: function (id) {
        if (!L || typeof L.query !== 'function') return Promise.resolve(null);
        return Promise.resolve().then(function () { return L.query(); }).then(function (q) {
          var nm = OPEN_LOCK + id, o = { held: 0, pending: 0, shared: 0, exclusive: 0 };
          [['held', (q && q.held) || []], ['pending', (q && q.pending) || []]].forEach(function (pr) { for (var i = 0; i < pr[1].length; i++) { var a = pr[1][i]; if (a && a.name === nm) { o[pr[0]]++; if (a.mode === 'shared') o.shared++; else o.exclusive++; } } });
          return o;
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
    if (rep.purge) return { at: rep.at, v: PVERSION, kind: mode, purge: true, candidates: rep.candidates, eligible: rep.eligible.length, skipped: rep.skipped,
             totals: rep.totals, perStoryChars: rep.eligible.map(function (x) { return x.chars; }).sort(function (a, b) { return b - a; }) };   /* 件数・文字数・理由だけ（id・題名は書かない） */
    return { at: rep.at, v: VERSION, kind: mode, candidates: rep.candidates, eligible: rep.eligible.length, skipped: rep.skipped,
             keys: rep.totals.keys, chars: rep.totals.chars, snapshotsKept: rep.totals.snapshotsKept, backupKept: rep.totals.backupKept, unknownKept: rep.totals.unknownKept,
             perStoryChars: rep.eligible.map(function (x) { return x.chars; }).sort(function (a, b) { return b - a; }) };
  }


  /* ======================================================================
   * ★STUCK1 r2: planByReason（読み取りだけ。消さない・書かない・ログも書かない）
   *   シートと同じ確認（r2 なら survey・PURGE1 なら surveyP。getstory と /api/auth/me を読むだけ）をして、
   *   物語ごとの理由（'eligible' を含む）を数え、その物語のキーを family ごとに数える。返すのは数だけ（id・題名・値は返さない）。
   *   Vault に関わる理由・id の形・保護・判定できない全体の理由は数だけ（その物語のキーを 1 本も見ない）。
   *   class: a / b / c（FAMILY_CLASS）・marker（f781g）・unsent（f911 / f697p / rescue）・snapshot・backup（chr6_bk_）・unknown（形の分からないキー）
   * ====================================================================== */
  var COUNT_ONLY = { vault: 1, passcode: 1, 'vault-cache-unreadable': 1, 'vault-unavailable': 1, 'vault-state-unknown': 1, 'vault-check-threw': 1,
                     'vault-server-unconfirmed': 1, 'vault-state-changed': 1, 'id-shape': 1, protected: 1, 'key1-unavailable': 1, 'meta-unreadable': 1 };
  function planByReason(env, ctx) {
    var why = {}, glob = [], purge = env.purge === true, e2 = {};
    for (var k0 in env) if (Object.prototype.hasOwnProperty.call(env, k0)) e2[k0] = env[k0];
    e2.onReason = function (sid, w) { if (sid === '*') glob.push(String(w)); else if (why[String(sid)] == null) why[String(sid)] = String(w); };
    e2.only = null;
    return (purge ? surveyP : survey)(e2, ctx).then(function (rep) {
      var ids = candidates(e2), elig = {}, i;
      for (i = 0; i < rep.eligible.length; i++) elig[String(rep.eligible[i].id)] = rep.eligible[i];
      var out = { v: SVERSION, base: purge ? PVERSION : VERSION, at: env.now(), mode: purge ? 'purge' : 'r2', stuck1: env.stuck1 === true, candidates: ids.length,
                  global: glob.slice(), reasons: {}, totals: { stories: 0, inspected: 0, countOnly: 0, keys: 0, chars: 0, freeNowStories: 0, freeNowKeys: 0, freeNowChars: 0, provableChars: 0 } };
      var rOf = {}, insp = {}, ninsp = 0;
      for (i = 0; i < ids.length; i++) {
        var id = ids[i], r = elig[id] ? 'eligible' : (why[id] || (glob.length ? glob[glob.length - 1] : 'not-reached'));
        rOf[id] = r;
        var R = out.reasons[r] || (out.reasons[r] = { stories: 0, inspected: 0, countOnly: 0, keys: 0, chars: 0, byClass: {}, byFamily: {}, freeNow: { stories: 0, keys: 0, chars: 0 }, provable: { keys: 0, chars: 0 } });
        R.stories++; out.totals.stories++;
        var co = COUNT_ONLY[r] === 1 || !env.key1 || !ID_RE.test(id) || PROTECT[id] === 1;
        if (!co) { var vb = null; try { vb = vaultBlock(id, env); } catch (eV) { vb = 'vault-check-threw'; } if (vb) co = true; }   /* 理由が別でも Vault に関わる物語はキーを見ない */
        if (co) { R.countOnly++; out.totals.countOnly++; continue; }
        R.inspected++; out.totals.inspected++; insp[id] = 1; ninsp++;
        if (elig[id]) { R.freeNow.stories++; R.freeNow.keys += elig[id].keys; R.freeNow.chars += elig[id].chars; out.totals.freeNowStories++; out.totals.freeNowKeys += elig[id].keys; out.totals.freeNowChars += elig[id].chars; }
      }
      if (!ninsp) return out;
      var K = env.key1, ks = allKeys(env), nul = [];
      function add(id, fam, cls, k) {
        var R = out.reasons[rOf[id]], v = g(env, k), c = k.length + (v == null ? 0 : v.length);
        R.keys++; R.chars += c; out.totals.keys++; out.totals.chars += c;
        var bc = R.byClass[cls] || (R.byClass[cls] = { keys: 0, chars: 0 }); bc.keys++; bc.chars += c;
        var bf = R.byFamily[fam] || (R.byFamily[fam] = { cls: cls, keys: 0, chars: 0 }); bf.keys++; bf.chars += c;
        if (cls === 'a' || cls === 'b' || cls === 'marker') { R.provable.keys++; R.provable.chars += c; out.totals.provableChars += c; }
      }
      for (i = 0; i < ks.length; i++) {
        var k = ks[i], s = null; try { s = K.storyOf(k); } catch (eS) { s = null; }
        if (!s) { nul.push(k); continue; }
        if (insp[s.id] !== 1) continue;
        var cls = s.kind === 'snapshot' ? 'snapshot' : (s.family === 'v292Dfix402_f781g_' ? 'marker' : ((s.kind === 'sync' || s.kind === 'rescue') ? 'unsent' : (s.kind === 'vault' ? 'vaultKey' : familyClass(s.family))));
        add(s.id, s.family, cls, k);
      }
      for (var j = 0; j < nul.length; j++) for (var id2 in insp) if (insp[id2] === 1 && K.mentions(nul[j], id2)) { var bk = nul[j].indexOf('chr6_bk_') === 0; add(id2, bk ? 'chr6_bk_' : 'unknown', bk ? 'backup' : 'unknown', nul[j]); }
      return out;
    });
  }
  var api = { version: VERSION, NOTICE: NOTICE, ID_RE: ID_RE, MAX_MULTI: MAX_MULTI, OPEN_LOCK: OPEN_LOCK, MAT_LOCK: MAT_LOCK, keysFor: keysFor, purgeList: purgeList, localBlock: localBlock, candidates: candidates,
              serverEval: serverEval, survey: survey, freeOne: freeOne, freeMany: freeMany, lockCtx: lockCtx, stable: stable,
              writeLog: writeLog, logOfSurvey: logOfSurvey, _memLog: function () { return memLog.slice(); },
              /* ★PURGE1 */ PURGE_ON: PURGE_ON, PURGE_OFF: PURGE_OFF, PURGE_VAULT: PURGE_VAULT, NOTICE_P: NOTICE_P, keysForP: keysForP, purgeListP: purgeListP, localBlockP: localBlockP, planP: planP,
              serverEvalP: serverEvalP, serverEvalMeta: serverEvalMeta, surveyP: surveyP, freeOneP: freeOneP,
              /* ★STUCK1 */ STUCK_OFF: STUCK_OFF, staleDirtyLocal: staleDirtyLocal, stuckNeeds: stuckNeeds, stuckProof: stuckProof,
              /* ★STUCK1 r2 */ STUCK_ON: STUCK_ON, SVERSION: SVERSION, FAMILY_CLASS: FAMILY_CLASS, familyClass: familyClass, provenSubset: provenSubset, raceProbe: raceProbe, raceBlock: raceBlock, planByReason: planByReason, COUNT_ONLY: COUNT_ONLY,
              /* ★FREE2c */ judgeOne: judgeOne, /* ★FREE2d */ _memoClear: function () { MEMO = {}; }, tombHashCheck: tombHashCheck, F2_VERSION: F2_VERSION };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  /* ================================================================ browser wiring (HOME only) */
  if (!root || !root.document || !root.localStorage) return;
  if (root.__v292DfixSTORE1b) return;
  var killed = false; try { killed = root.localStorage.getItem(KILL) === '1'; } catch (e) { killed = true; }
  if (killed) return;                                                       /* kill: このキー 1 本を読んだだけ。入口も global も作らない */
  var st = { version: VERSION, opened: 0, surveys: 0, freed: 0, last: null, lastSurvey: null, dry: null };
  function lsg(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } }
  /* ★STUCK1 r2: ほかのタブの書き込み（storage イベントはほかのタブの setItem / removeItem / clear だけで来る）。
     chr6_slots_meta・clear は全物語、KEY1 で物語が決まるキーはその物語の数を進める。値は読まない */
  var OT = { all: 0, per: {} };
  try { root.addEventListener('storage', function (ev) { try {
    if (ev.storageArea && ev.storageArea !== root.localStorage) return;
    var k = ev.key; if (k == null || k === 'chr6_slots_meta') { OT.all++; return; }
    var K1 = root.__v292DfixKEY1, s = (K1 && typeof K1.storyOf === 'function') ? K1.storyOf(k) : null;
    if (s && s.id) OT.per[s.id] = (OT.per[s.id] || 0) + 1;
  } catch (e0) { OT.all++; } }); } catch (eL) {}
  function otherTabSeq(id) { return OT.all + ':' + (OT.per[String(id)] || 0); }
  function benv() {
    var K = null; try { K = root.__v292DfixKEY1; K = (K && typeof K.enabled === 'function' && K.enabled()) ? K : null; } catch (e) { K = null; }
    var pOn = lsg(PURGE_ON) === '1' && lsg(PURGE_OFF) !== '1';
    return { ls: root.localStorage, ss: root.sessionStorage, now: function () { return Date.now(); }, key1: K, multi: lsg(MULTI) === '1',
             purge: pOn, purgeVault: pOn && lsg(PURGE_VAULT) === '1',
             stuck1: lsg(STUCK_ON) === '1' && lsg(STUCK_OFF) !== '1', dirtyProof: dirtyProofB, otherTab: otherTabSeq,   /* ★STUCK1 r2: 既定 OFF */
             zt1: lsg(ZT_ON) === '1' && lsg(ZT_OFF) !== '1',   /* ★ZT1: 既定 OFF */
             free2: lsg(F2_OFF) !== '1',   /* ★FREE2c: 既定 ON（kill v292DfixFREE2Off='1'）。v292DfixFREE2On は読まない */
             free2d: lsg('v292DfixFREE2dOff') !== '1',   /* ★FREE2d（kill v292DfixFREE2dOff='1' → FREE2c と同じ） */
             saveBusy: saveBusyB,   /* ★FREE2c: この画面の fix697 がその物語の保存を送っている最中か（FREE2 のときだけ呼ぶ） */
             vault: root.__v292Dfix889 || null, inv: root.__v292Dfix562 || null, gate: root.__v292Dfix569 || null,
             iso2Foreign: function (id) { try { var I = root.__v292Diso2; if (!I || typeof I.stampOf !== 'function' || typeof I.owner !== 'function') return false;
               var me = I.owner().now, sp = I.stampOf(id, 's'); if (!sp) return false; return !!((sp.c && sp.c !== me) || (sp.w && sp.w !== me)); } catch (e) { return true; } } };
  }
  function saveBusyB(id) { var W = root.__v292Dfix697; if (!W || typeof W.status !== 'function') return false; var s = W.status(); return !!(s && s.storyId != null && String(s.storyId) === String(id) && s.inFlight); }
  /* ★STUCK1: fix587 DP1 と同じ導出（fix697.projectionV2 → deleted:true → canonicalString → SHA-256）。title は墓標の title。
     home は fix743（CC2）を常には読まないので、fix587 dp1LoadCC2 と同じ URL で要るときだけ読む（純関数モジュール）。null = 一致 */
  function loadCC2(cb) {
    try {
      if (root.__v292DfixCC2 && typeof root.__v292DfixCC2.buildSchema2Record === 'function') return cb(true);
      var done = false, fin = function (v) { if (!done) { done = true; cb(v); } };
      var sc = root.document.createElement('script'); sc.src = 'v292Dfix743-cc2-client.js?cb=20261006-n2';
      sc.onload = function () { fin(!!(root.__v292DfixCC2 && typeof root.__v292DfixCC2.buildSchema2Record === 'function')); };
      sc.onerror = function () { fin(false); }; root.setTimeout(function () { fin(false); }, 8000);
      (root.document.head || root.document.documentElement).appendChild(sc);
    } catch (e) { cb(false); }
  }
  function dirtyProofB(id, title, serverHash, o) { return free2HashB(id, title, o).then(function (r) { return r.why ? r.why : (r.h === serverHash ? null : 'content-differs'); }); }
  /* この端末の全体（projectionV2＋deleted＋title）の canonicalString の SHA-256。{ h } か { why }。読むだけ */
  function free2HashB(id, title, o) {
    return new Promise(function (res0) {
      var res = function (w) { res0({ why: w }); };
      loadCC2(function (ok) {
        if (!ok) return res('no-cc2');
        var W = root.__v292Dfix697; if (!W || typeof W.projectionV2 !== 'function' || typeof W.canonicalString !== 'function') return res('no-projection');
        var c = null; try { c = W.projectionV2(id); } catch (e) { c = null; }
        if (!c || c.schema !== 2 || String(c.id) !== String(id)) return res('no-projection');
        var t = {}; for (var k in c) if (Object.prototype.hasOwnProperty.call(c, k)) t[k] = c[k];
        t.deleted = true; t.title = String(title);
        /* ★FREE2d: サーバーの行が memoryV1 を持つときだけ、この端末の v292Dmem1_slot_<id>（無ければ null）を入れる（HOME には fix793 が無い） */
        if (o && o.mem === true) { var sc = {}; if (t.sidecar && typeof t.sidecar === 'object') for (var k2 in t.sidecar) if (Object.prototype.hasOwnProperty.call(t.sidecar, k2)) sc[k2] = t.sidecar[k2];
          var mr = lsg('v292Dmem1_slot_' + String(id)), mv = null; if (mr != null) { try { mv = JSON.parse(mr); } catch (eM) { return res('mem-unreadable'); } } sc.memoryV1 = mv; t.sidecar = sc; }
        var str; try { str = String(W.canonicalString(t)); } catch (e2) { return res('serialize'); }
        try {
          if (!root.crypto || !root.crypto.subtle || typeof root.TextEncoder === 'undefined') return res('no-digest');
          root.crypto.subtle.digest('SHA-256', new root.TextEncoder().encode(str)).then(function (buf) {
            var a = new Uint8Array(buf), h = ''; for (var i = 0; i < a.length; i++) { var x = a[i].toString(16); h += (x.length < 2 ? '0' : '') + x; }
            res0({ h: h });
          }, function () { res('digest-failed'); });
        } catch (e3) { res('digest-failed'); }
      });
    });
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
      /* ★PURGE1: 隠した物語の削除済みの確認は、本文を含まない一覧の行（listshadow）だけで行う */
      serverMeta: function (id) { return new Promise(function (res) { var W = root.__v292Dfix697; if (!W || typeof W.listShadowBasisOnce !== 'function') return res(null);
        try { W.listShadowBasisOnce(function (rows, err, status) { if (!rows) return res({ status: status || 0 }); var hit = null; for (var i = 0; i < rows.length; i++) if (rows[i] && String(rows[i].id) === String(id)) { hit = rows[i]; break; } res({ status: 200, row: hit }); }); } catch (e) { res(null); } }); },
      lockHeld: lc.lockHeld, lockInfo: lc.lockInfo, withOpenLock: lc.withOpenLock, withMatLock: lc.withMatLock
    };
  }
  function ready() {
    if (lsg(KILL) === '1') return false;
    var e = benv(); if (!e.key1 || !e.inv || typeof e.inv.store1Arm !== 'function' || !e.gate || typeof e.gate.tryDeleteExact !== 'function') return false;
    if (e.purge && typeof e.inv.purge1Arm !== 'function') return false;     /* ★PURGE1: fix562 が対応していなければ使わない */
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
            '<div class="soft" id="s1bnotice" role="note">' + esc(M.purge ? NOTICE_P : NOTICE) + '</div>' +
            (M.purge ? '<p>一覧から削除した物語のうち、サーバーで削除が確定したものだけを表示します。この端末に残ったその物語のデータ（本文・スナップショット・控え）を消します。' :
            '<p>一覧から削除した物語のうち、クラウドに同じ本文が残っていると確かめられたものだけを表示します。消すのはこの端末の写しだけで、クラウドのデータは変わりません。') +
            (M.multi ? '一度に ' + MAX_MULTI + ' 件まで選べます。1 件ずつ確かめながら消し、うまくいかない物語があればそこで止めます。' : '1 件ずつ選んで消します。') + '</p>';
    h += '<div class="msg" id="s1bmsg">' + esc(M.msg || '') + '</div>';
    if (M.rep && M.phase !== 'loading') {
      var t = M.rep.totals;
      h += M.purge ? ('<p id="s1btotal">消せる物語 ' + t.stories + ' 件・合計 約 ' + esc(kchars(t.chars)) + (t.blind ? '（隠した物語 ' + t.blind + ' 件は中身を見ずに消すため、文字数に入っていません）' : '') + '</p>')
                   : ('<p id="s1btotal">消せる物語 ' + t.stories + ' 件・合計 ' + esc(kchars(t.chars)) + '（スナップショット ' + t.snapshotsKept + ' 件は残します）</p>');
      var full = M.picks.length >= (M.multi ? MAX_MULTI : 1);
      for (var i = 0; i < M.rep.eligible.length; i++) {
        var r = M.rep.eligible[i], on = M.picks.indexOf(r.id) >= 0;
        var dis = M.phase !== 'ready' || (M.multi && full && !on);
        var tok = r.blind ? ('h' + i) : r.id;                                    /* ★PURGE1c: 隠した物語の id は画面（DOM）にも出さない */
        h += '<div class="row" data-row="' + esc(tok) + '"><input type="checkbox" data-s1bchk="' + esc(tok) + '"' + (on ? ' checked' : '') + (dis ? ' disabled' : '') + ' aria-label="選ぶ">' +
             '<div style="flex:1;min-width:0"><div class="t">' + esc(r.blind ? '（隠した物語・題名は表示しません）' : (r.title || '（題名なし）')) + '</div><div class="s">' + (M.purge ? '' : 'ターン ' + esc(r.turns == null ? '—' : r.turns) + '・') + 'この端末で空く量 ' + esc(r.blind ? '（数えません）' : kchars(r.chars)) + '</div></div></div>';
      }
      var sk = 0, done0 = 0; for (var c in M.rep.skipped) { if (c === 'nothing-left' && M.stuck1) done0 += M.rep.skipped[c]; else sk += M.rep.skipped[c]; }   /* ★STUCK1: 片づけ済み（墓標だけ）は別に数える */
      if (sk) h += '<p>確かめられなかったため、今回は対象にしていない物語が ' + sk + ' 件あります（そのまま残します）。</p>';
      if (done0) h += '<p>この端末からもう片づけ済みの物語が ' + done0 + ' 件あります（一覧から削除した印だけを残しています）。</p>';
      if (M.multi && M.phase === 'ready') h += '<p id="s1bsel">選んだ物語 ' + M.picks.length + ' 件・この端末で空く量 約 ' + esc(kchars(pickedChars())) + '（最大 ' + MAX_MULTI + ' 件）</p>';
    }
    if (M.phase === 'confirm' && M.picks.length) {
      var prs = pickedRows();
      var NT = M.purge ? NOTICE_P : NOTICE, tl = function (x) { return x.blind ? '（隠した物語）' : (x.title || '（題名なし）'); };
      if (prs.length === 1) h += '<div class="soft" id="s1bconfirm" role="note"><b>この端末から消す物語：</b>「' + esc(tl(prs[0])) + '」（' + esc(prs[0].blind ? '—' : kchars(prs[0].chars)) + '）<br>' + esc(NT) + '。</div>';
      else h += '<div class="soft" id="s1bconfirm" role="note"><b>この端末から消す物語：</b>' + prs.length + ' 件（合計 約 ' + esc(kchars(pickedChars())) + '）<br>' +
                prs.map(function (x) { return '「' + esc(tl(x)) + '」'; }).join('、') + '<br>' + esc(NT) + '。<br>1 件ずつ確かめながら消します。うまくいかない物語があれば、そこで止めます（残りには手を付けません）。</div>';
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
    var hm = /^h(\d+)$/.exec(id); if (hm) { var hr = M.rep && M.rep.eligible[+hm[1]]; if (!hr || !hr.blind) return; id = hr.id; }
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
              'content-mismatch': 'この端末とクラウドで本文の内容が違うため、何も消していません。',
              purged: 'この端末から完全に消しました。', 'changed-after-delete': '削除のあとでこの物語に書き込みがあったため、何も消していません。',
              'vault-server-unconfirmed': '隠した物語の削除をサーバーで確かめられないため、何も消していません（Vault を開いてからもう一度試せます）。',
              'vault-state-changed': '隠す設定が途中で変わったため、何も消していません。', 'in-flight': 'この物語の保存がまだ送信中のため、何も消していません。',
              unsynced: 'この物語に、まだクラウドへ送っていない変更が残っているため、何も消していません。', stash: 'この物語に、まだクラウドへ送っていない変更が残っているため、何も消していません。',
              journal: 'この物語に、まだクラウドへ送っていない変更が残っているため、何も消していません。', rescue: 'この物語に、まだクラウドへ送っていない変更が残っているため、何も消していません。',
              'unsynced-unproven': 'この物語に、クラウドと同じだと確かめられない変更が残っているため、何も消していません。',
              'other-tab-write': 'ほかの画面でこの物語のデータが書き換えられたため、何も消していません。', 'meta-changed': '物語の一覧の記録が確認のあとで変わったため、何も消していません。',
              'purge-dirty-hold': 'この物語に、クラウドへ送っていなかった変更の印が残っているため、完全には消していません。',
              'title-write-failed': '物語のデータは消しましたが、一覧の記録の書き換えができませんでした。もう一度開くと続きを片づけます。' };
  function doFree(id) {
    var mine = M; M.phase = 'running'; M.msg = ''; render();
    var e = benv();
    return (e.purge ? freeOneP : freeOne)(id, e, bctx()).then(function (x) {
      st.last = { code: x.code, removed: x.removed, chars: x.chars };
      var logRun = e.purge ? { at: Date.now(), v: PVERSION, kind: 'purge', code: x.code, removed: x.removed, chars: x.chars, blind: x.blind }
                           : { at: Date.now(), v: VERSION, kind: 'free', code: x.code, removed: x.removed, chars: x.chars, turnsMatched: x.ok ? x.turnsMatched : undefined };
      if (x.ok && e.purge) { st.freed++; logRun.snapshots = x.snapshots; logRun.backups = x.backups; logRun.unsent = x.unsent; }   /* ★PURGE1: 完全削除した物語の id はログにも残さない（件数だけ） */
      else if (x.ok) { st.freed++; logRun.id = id; logRun.snapshotsKept = x.snapshotsKept; logRun.backupKept = x.backupKept; logRun.unknownKept = x.unknownKept; }
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
      var logRun = { at: Date.now(), v: e.purge ? PVERSION : VERSION, kind: e.purge ? 'purge-multi' : 'free-multi', code: x.code, total: x.total, done: x.done, failed: x.failed, notProcessed: x.notProcessed,
                     failedCode: x.failedCode, removed: x.removed, chars: x.chars, ids: e.purge ? undefined : x.doneIds.slice() };   /* ★PURGE1: id は書かない（件数だけ） */   /* 消した物語の id だけ（Vault は関門で対象外） */
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
    var be0 = benv();
    M = { phase: 'loading', msg: msg || '確認しています…', rep: null, picks: [], multi: lsg(MULTI) === '1', result: result || null, step: null, purge: be0.purge === true, stuck1: be0.stuck1 === true };
    render();
    if (!ready()) { M.phase = 'done'; M.msg = 'いまはこの操作を使えません。物語はそのまま残っています。'; render(); return Promise.resolve(false); }
    var mine = M;
    var be1 = benv();
    return (be1.purge ? surveyP : survey)(be1, bctx()).then(function (rep) {
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
    return (e.purge ? surveyP : survey)(e, bctx()).then(function (rep) { var L = logOfSurvey(rep, 'dry'); L.logWritten = writeLog(e, L); st.dry = L; return L; });
  }
  root.__v292DfixSTORE1b = {
    version: VERSION,
    open: function () { return openFlow(); },
    multi: function () { return lsg(MULTI) === '1'; },
    dryRun: dryRun,
    /* ★STUCK1: その 1 件だけ、シートと同じ確認をして理由コードを返す（何も消さない・書かない。getstory と /api/auth/me を読むだけ） */
    explain: function (id) { if (!ready()) return Promise.resolve({ notReady: true }); var e = benv(); e.only = [String(id)];
      var cx = bctx();
      return (e.purge ? surveyP : survey)(e, cx).then(function (rep) { var out = { purge: !!e.purge, candidate: rep.candidates === 1, eligible: rep.eligible.length === 1, skipped: rep.skipped, dirtyProven: !!(rep.eligible[0] && rep.eligible[0].dirtyProven) };
        if (e.free2 !== true) return out;
        return Promise.resolve(cx.lockInfo(String(id))).then(function (li) { out.openLock = li; return out; }, function () { return out; }); }); },   /* ★FREE2c: Lock の数（切り分け用） */
    /* ★STUCK1 r2: 理由ごとの数と family ごとの文字数だけ（読むだけ。消さない・書かない） */
    planByReason: function () { if (!ready()) return Promise.resolve({ notReady: true, v: SVERSION }); return planByReason(benv(), bctx()); },
    /* ★FREE2: DL2 が削除の成立の直後に使う。この端末の全体の hash と印の指紋（読むだけ・通信なし。OFF のときは null） */
    free2Hash: function (id, title, o) { if (benv().free2 !== true) return Promise.resolve(null); if (lsg('v292DfixFREE2dOff') === '1') o = undefined;
      var raw = lsg('v292Dfix402_f781g_' + String(id)), jr0 = lsg('v292Dfix402_f697p_' + String(id));
      return free2HashB(String(id), String(title), o).then(function (r) { return { h: r.h || null, why: r.why || null, mk: raw == null ? null : h53(raw), jr: jr0 == null ? null : h53(jr0),
        same: lsg('v292Dfix402_f781g_' + String(id)) === raw && lsg('v292Dfix402_f697p_' + String(id)) === jr0 }; }, function () { return null; }); },
    free2: function () { return { v: F2_VERSION, on: benv().free2 === true }; },
    /* ★FREE2 dry-run（読むだけ: 消さない・書かない・記録も書かない。通信は /api/auth/me と候補ごとの getstory＝シートを開くのと同じ）。
       返すのは数だけ: 解放できる物語の数・その鍵の数と字数の合計・対象外の数と理由コード別の内訳。id・題名・本文・鍵名は返さない。
       鍵の有無に関係なく「いまの設定でシートがどう判定するか」を返す（on = FREE2 が効いているか）。 */
    free2DryRun: function () {
      var e = benv(), o = { v: F2_VERSION, on: e.free2 === true, mode: e.purge ? 'purge' : 'r2', at: Date.now(), candidates: 0, freeable: { stories: 0, keys: 0, chars: 0, viaProof: 0 }, excluded: { stories: 0, byReason: {} }, global: null };
      if (!ready()) { o.notReady = true; return Promise.resolve(o); }
      var glob = null; e.onReason = function (sid, w) { if (sid === '*') glob = String(w); };
      return (e.purge ? surveyP : survey)(e, bctx()).then(function (rep) {
        o.candidates = rep.candidates || 0; o.global = glob;
        for (var i = 0; i < rep.eligible.length; i++) { var x = rep.eligible[i]; o.freeable.stories++; o.freeable.keys += +x.keys || 0; o.freeable.chars += +x.chars || 0; if (x.dirtyProven === true) o.freeable.viaProof++; }
        for (var k in rep.skipped) if (Object.prototype.hasOwnProperty.call(rep.skipped, k) && k !== glob) { o.excluded.byReason[k] = rep.skipped[k]; o.excluded.stories += rep.skipped[k]; }
        return o;
      }, function () { o.failed = true; return o; });
    },
    status: function () { return JSON.parse(JSON.stringify({ version: VERSION, stuck1: { v: SVERSION, on: benv().stuck1 === true }, ready: ready(), opened: st.opened, surveys: st.surveys, freed: st.freed, last: st.last, lastSurvey: st.lastSurvey, dry: st.dry, memLog: memLog })); }
  };
  function boot() {
    decorate();
    try { var mo = new root.MutationObserver(function () { if (!root.document.getElementById('s1bBtn')) decorate(); }); mo.observe(root.document.body, { childList: true, subtree: true }); } catch (e) {}
    if (lsg(DRY) === '1') root.setTimeout(function () { dryRun(); }, 6000);
  }
  if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', function () { root.setTimeout(boot, 1500); }); else root.setTimeout(boot, 1500);
})(typeof window !== 'undefined' ? window : null);
