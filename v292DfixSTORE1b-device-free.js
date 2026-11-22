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
  var MULTI_OFF = 'v292DfixSTORE1MultiOff';   /* ★ALLON-B: まとめて選ぶ（最大 10 件・確認 1 回）は全員の既定 ON。kill v292DfixSTORE1MultiOff='1'（旧 On 鍵 v292DfixSTORE1Multi は読まない） */
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
  /* ★ZT1b（GPT #127-VJ 3・案 a）: hash（fix697 projectionV2 ← fix743 buildSchema2Record）は chr6_slot_ の本体を全部は入れない。
       入らないもの: cfg のうち HY_CFG_ALLOW（11 本）の外の鍵／本体の cfg・cast・scene・turns・mode 以外の鍵／cast.av2（HOME の __v292Dav2Map.push が外して作り直す）。
     ZT1 の証明（0 ターンの墓標・印が DIRTY の 0 ターン）は、hash の一致に加えて、hash に入らない部分が「空・コードの既定値・コードが強制する値」だけであることを求める。
     未知の鍵・一覧に無い値・読めない本体 → 'zero-turn-extra'（残す）。値の比較は === だけ（文字列の '6' と数の 6 は別）。迷うものは許可しない。
     許可する値の出所（README）: index.html の S.cfg 初期値（provider/key/naiKey/orKey/pollKey/model/debug/showInner）・index.html の simpleMode の既定・
       fix247 / fix328 / fix336 / fix886 が強制する '__proxy__' と 'openrouter'・fix355 の aiAvatar=true・fix395 の DEFAULT=3 と TARGET=6・fix374 の UNIFIED=6・
       orModel は '' と HOME のモデル一覧（v292Dsmrc1）の primary() だけ（fix354 / fix370 が入れる値）。
     DIRTY_INTENT / DIRTY_LOCAL の印の物語は v292DfixZT1DirtyOn='1' のときだけ ZT1 に回す（既定は今までどおり 'unsynced'）。ZT1 OFF のときはどれも読まない。 */
  var ZT_DIRTY = 'v292DfixZT1DirtyOn', ZT_EXTRA = 'zero-turn-extra';
  var ZT_TOP = { cfg: 1, cast: 1, scene: 1, turns: 1, mode: 1 };   /* index.html S.save・FLW5 が書く 5 つ（projectionV2 がそのまま入れる。cfg は下の 11 本だけ） */
  var ZT_CFG_HASHED = { authorNote: 1, bannedPhrases: 1, creepyMode: 1, dialogueLevel: 1, dramaLevel: 1, engineMode: 1, genrePresets: 1, outLen: 1, reactionLevel: 1, toneKey: 1, artPreset: 1 };   /* = fix743 HY_CFG_ALLOW = Worker CHR_CANONICAL_CFG_ALLOW */
  var ZT_CFG_DEFAULT = { provider: ['anthropic', 'openrouter'], key: [''], naiKey: [''], orKey: ['', '__proxy__'], pollKey: ['', '__proxy__'], model: ['claude-haiku-4-5-20251001'],
                         debug: [false], showInner: [true], simpleMode: [false], aiAvatar: [true], artStyle: [3, 6] };
  function ztHas(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function zt1Extra(id, env) {
    var b = J(g(env, 'chr6_slot_' + id), null);
    if (!b || typeof b !== 'object' || isArr(b)) return ZT_EXTRA;
    for (var k in b) if (ztHas(b, k) && ZT_TOP[k] !== 1) return ZT_EXTRA;                                   /* 本体の未知の鍵 */
    var c = b.cfg;
    if (c != null) {
      if (typeof c !== 'object' || isArr(c)) return ZT_EXTRA;                                                /* object でない cfg は hash で null になる */
      for (var k2 in c) {
        if (!ztHas(c, k2) || ZT_CFG_HASHED[k2] === 1) continue;
        var al = (k2 === 'orModel') ? [''].concat(isArr(env.zt1Models) ? env.zt1Models : []) : (ztHas(ZT_CFG_DEFAULT, k2) ? ZT_CFG_DEFAULT[k2] : null), ok = false;
        if (al) for (var i = 0; i < al.length; i++) if (al[i] === c[k2]) { ok = true; break; }
        if (!ok) return ZT_EXTRA;                                                                             /* hash に入らない設定に、既定でない値か未知の鍵 */
      }
    }
    var ca = b.cast;
    if (ca && typeof ca === 'object' && !isArr(ca) && ztHas(ca, 'av2')) return ZT_EXTRA;                      /* av2 は push が作り直す（そのままは hash に入らない） */
    return null;
  }
  /* ★EXTRA1（ZT1b r2・既定 ON・kill v292DfixEXTRA1Off='1'）: ZT1 以外の「hash の一致で証明して消す」経路（FREE2 の証明・STUCK1・FREE2c の墓標の hash）にも、
     zt1Extra と同じ検査を、hash が一致した後に足す。hash に入らない本体の部分（HY_CFG_ALLOW 外の cfg・本体の未知の鍵・cast.av2）が
     空・既定値・コードが強制する値でなければ 'proof-extra' で残す。一致しなかった物語の理由は今までと同じ（消す対象が減る向きだけ）。
     本体がもう無い（前回の途中の続きで、印だけ残っている）ときは、hash に入らない部分も無いので見ない。 */
  var EX_OFF = 'v292DfixEXTRA1Off', EX_WHY = 'proof-extra';
  /* ★EXTRA1 r3（GPT #127-VL 1・案 ii）: 0 ターンでない FREE2 / STUCK1 / FREE2c では、hash に入らない cfg のうち
     「削除済みの物語だけのもので、本文に関わらない設定」を、名前を挙げて型・値の範囲・置き場所（その物語の本体の cfg の直下）を確かめて許す。
     許す鍵と値（README の表）: provider（#cfgProvider の 3 つ）・model（#cfgModel の 2 つ）・orModel（モデル一覧が primary / secondary / 旧 primary / 管理する名前と認めた文字列）・
       artStyle（0〜7 の整数＝fix338 の LABELS）・aiAvatar（true / false / 0 / 1）・debug / showInner / simpleMode（真偽値）・_spiceT（0 以上でターン数以下の整数＝fix192）・
       key / naiKey / orKey / pollKey（空・'__proxy__'、または同じ値を生きている物語〔削除済みでなく Vault で隠していない〕の cfg の同じ鍵が持つ＝この物語の写しにすぎない）。
     それ以外（未知の鍵・型違い・範囲外・入れ子・本体の 5 鍵以外・cast.av2・読めない本体）は今までどおり残す。キーの値は記録・画面・ログに出さない（理由は鍵の名前の種類だけ）。
     ZT1（0 ターン）は r1/r2 のまま厳密（既定値だけ）。 */
  var EX1_PROVIDER = ['anthropic', 'openrouter', 'novelai'];                 /* index.html #cfgProvider の option */
  var EX1_MODEL = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6'];         /* index.html #cfgModel の option */
  var EX1_ART_MAX = 7;                                                         /* fix338 LABELS は 8 個（features.js の mkSel は +value で数を入れる） */
  var EX1_KEYS = { key: 1, naiKey: 1, orKey: 1, pollKey: 1 }, EX1_BOOL = { debug: 1, showInner: 1, simpleMode: 1 };
  var EX1_NAMES = { provider: 1, model: 1, orModel: 1, artStyle: 1, aiAvatar: 1, debug: 1, showInner: 1, simpleMode: 1, _spiceT: 1, key: 1, naiKey: 1, orKey: 1, pollKey: 1 };
  function ex1Int(v, lo, hi) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= lo && v <= hi; }
  /* ★EXTRA1 r4（zt1fix3 レビューの注記 1・Owner のルール「Vault で隠した物語は、どの経路でも読まない」）:
     隠した物語の集合は、VAULTGUARD1 の kill に関係なく、入口ごとに読む vault2status（env.ex1Vault）と fix889 の隠し一覧（vaultBlock）の両方で決める。
     分かったと言えるのは none（Vault v2 なし）・locked（施錠中＝隠した行はサーバーの一覧にも出ず、fix889 の一覧が持つ）・unlocked（hiddenIds が完全）だけ。
     それ以外（unknown・読めない・古い・欄の欠け）は「分からない」として、隠した物語かもしれない相手を 1 つも読まない。 */
  var EX1_READ_MAX = 20;   /* 1 回の実行で、キーの写しを探すために読む相手の本体の数の上限（越えたら写しと認めない） */
  function exVaultKnown(env) { var V = env && env.ex1Vault; if (!V || typeof V !== 'object') return false;
    if (V.state === 'none' || V.state === 'locked') return true; return V.state === 'unlocked' && !!V.ids && typeof V.ids === 'object'; }
  function exHidden(id, env) { if (vaultBlock(id, env)) return true; var V = env.ex1Vault; return !!(V && V.state === 'unlocked' && V.ids && V.ids[String(id)] === 1); }
  function ex1KeyCopy(k, v, id, env) {   /* 同じ値を、生きている別の物語（Vault で隠していない）の cfg の同じ鍵が持つ。値はメモリの中で比べるだけ */
    if (typeof v !== 'string' || !v || v.length > 1024) return false;
    if (!exVaultKnown(env)) return false;                                                     /* 隠した物語の集合が分からない → 写しと認めない */
    var ctr = env.ex1Ctr || (env.ex1Ctr = { left: EX1_READ_MAX });                            /* 1 回の実行で共有（benv が作る。無ければここで作る） */
    var needle = JSON.stringify(v).slice(1, -1), m = metaRows(env) || [];
    for (var i = 0; i < m.length; i++) { var r = m[i]; if (!r || r.deleted === true || r.id == null) continue; var lid = String(r.id); if (lid === id) continue;
      if (exHidden(lid, env)) continue;                                                       /* 隠した物語は読まない */
      if (!(ctr.left > 0)) { ctr.capped = true; return false; }                                /* 上限 → 写しと認めない */
      ctr.left--;
      var raw = g(env, 'chr6_slot_' + lid);
      if (typeof raw !== 'string' || raw.indexOf(needle) < 0) { raw = null; continue; }       /* 同じ値の文字列を持つ相手だけ解析する */
      var c = null; try { var b = JSON.parse(raw); c = (b && typeof b === 'object' && !isArr(b) && b.cfg && typeof b.cfg === 'object' && !isArr(b.cfg) && ztHas(b.cfg, k)) ? b.cfg[k] : null; b = null; } catch (eJ) { c = null; }
      raw = null;                                                                              /* 本体はここで捨てる（欄の値だけを比べる） */
      if (c === v) return true; }
    return false;
  }
  function ex1Ok(k, v, nT, id, env) {
    if (ztHas(ZT_CFG_DEFAULT, k)) { var al = ZT_CFG_DEFAULT[k]; for (var i = 0; i < al.length; i++) if (al[i] === v) return true; }   /* r1 の既定値 */
    if (k === 'provider') return typeof v === 'string' && EX1_PROVIDER.indexOf(v) >= 0;
    if (k === 'model') return typeof v === 'string' && EX1_MODEL.indexOf(v) >= 0;
    if (k === 'orModel' && isArr(env.zt1Models) && env.zt1Models.indexOf(v) >= 0) return true;   /* r1: '' と primary() */
    if (k === 'orModel') return v === '' || (typeof v === 'string' && v.length <= 200 && /^[A-Za-z0-9._:\/-]+$/.test(v) && typeof env.ex1ModelOk === 'function' && env.ex1ModelOk(v) === true);
    if (k === 'artStyle') return ex1Int(v, 0, EX1_ART_MAX);
    if (k === 'aiAvatar') return v === true || v === false || v === 0 || v === 1;
    if (EX1_BOOL[k] === 1) return typeof v === 'boolean';
    if (k === '_spiceT') return nT >= 0 && ex1Int(v, 0, nT);
    if (EX1_KEYS[k] === 1) return v === '' || v === '__proxy__' || ex1KeyCopy(k, v, id, env);
    return false;
  }
  /* null = 許す / 外す理由の種類（鍵の名前だけ。値は入れない） */
  /* ★EXTRA1 r5（SMOKE28: 絵のある物語が全部 'cast:av2' で残った）: cast.av2 = { assetSchema:2 | assetIdPrep:1, sid, bindings, known, retired }（v292Dav2-data D1）。
     HOME の projectionV2 は fix743 → __v292Dav2Map.push を通るので、hash（＝Worker の墓標と同じ規則）には次が入る:
       モード（body.assetSchema / assetIdPrep）・bindings（body.bindings）・retired の行（npcs へ足す）・cast に無い id の known（DEPARTED として npcs へ足す）。
     入らないのは「cast に同じ id の行がある known / retired の写し」だけ。known・retired はサーバーの本体からしか作られない（pull・登録の読み戻し・fixKNW）が、
     ここでは念のため、その写しが hash に入る cast の行と 1 文字も違わない（stable が同じ）ことを求める。違えば残す。
     id の無い NPC の名前が bindings にある（push が id を付け直す＝再登場）ときは、どの写しが hash に入るか決まらないので残す。
     鍵は 6 つだけ・sid はこの物語・モードは 1 つ・bindings は 1〜80 字の名前 → ch_ の id（1024 個まで）・known / retired は ch_ の id ごと。ほかは全部残す。 */
  var AV2_KEYS = { assetSchema: 1, assetIdPrep: 1, sid: 1, bindings: 1, known: 1, retired: 1 }, AV2_CID = /^ch_[A-Za-z0-9_-]{8,64}$/, AV2_ST = { DEPARTED: 1, DELETED: 1 };
  function ex1Plain(o) { return !!o && typeof o === 'object' && !isArr(o); }
  /* ★EXTRA1 r6（SMOKE29: 自動で付いた voice が cast の行にだけあり、known の写しに無い 2 本が 'cast:av2.known' で残った）:
     写し a が、hash に入る cast の行 b の部分集合か。a の鍵は全部 b に（自分の鍵として）あり、値は object なら同じ規則で、それ以外（配列・文字列・数・真偽・null）は stable が同じ。
     b にだけある鍵は許す（b は hash に入るので、a を消しても hash で証明されていない情報は失われない）。a にだけある鍵・値が違う鍵（古い版の写しなど）があれば残す。深さ 32 まで。 */
  function ex1Sub(a, b, d) {
    if (d > 32) return false;
    if (ex1Plain(a)) { if (!ex1Plain(b)) return false; for (var k in a) { if (!ztHas(a, k)) continue; if (!ztHas(b, k) || !ex1Sub(a[k], b[k], d + 1)) return false; } return true; }
    return stable(a) === stable(b);
  }
  function ex1Nm(s) { try { return (typeof s.normalize === 'function' ? s.normalize('NFC') : s).trim(); } catch (e) { return s; } }   /* v292Dav2-data push と同じ */
  function ex1Av2(id, ca) {
    var a = ca.av2, i, k;
    if (!ex1Plain(a)) return 'cast:av2';
    for (k in a) if (ztHas(a, k) && AV2_KEYS[k] !== 1) return 'cast:av2';
    var s2 = ztHas(a, 'assetSchema'), pp = ztHas(a, 'assetIdPrep');
    if (!((s2 && a.assetSchema === 2 && !pp) || (pp && a.assetIdPrep === 1 && !s2))) return 'cast:av2';
    if (a.sid !== id) return 'cast:av2.sid';
    var list = [], ents = {}; if (ex1Plain(ca.hero)) list.push(ca.hero); if (isArr(ca.npcs)) for (i = 0; i < ca.npcs.length; i++) if (ex1Plain(ca.npcs[i])) list.push(ca.npcs[i]);
    for (i = 0; i < list.length; i++) { var cid = list[i].character_id; if (cid === undefined) continue; if (typeof cid !== 'string' || !AV2_CID.test(cid) || ztHas(ents, cid)) return 'cast:av2'; ents[cid] = list[i]; }
    var bd = ztHas(a, 'bindings') ? a.bindings : {}, nb = 0;
    if (!ex1Plain(bd)) return 'cast:av2.bindings';
    for (k in bd) { if (!ztHas(bd, k)) continue; if (++nb > 1024 || !k || k.length > 80 || k !== k.trim() || typeof bd[k] !== 'string' || !AV2_CID.test(bd[k])) return 'cast:av2.bindings'; }
    for (i = 0; i < list.length; i++) if (list[i].character_id === undefined && typeof list[i].name === 'string' && ztHas(bd, ex1Nm(list[i].name))) return 'cast:av2.bindings';   /* 再登場（push が id を付け直す。★r6: push と同じ NFC・前後の空白の正規化） */
    var rt = ztHas(a, 'retired') ? a.retired : [], rid = {};
    if (!isArr(rt)) return 'cast:av2.retired';
    for (i = 0; i < rt.length; i++) { var r = rt[i]; if (!ex1Plain(r) || typeof r.character_id !== 'string' || !AV2_CID.test(r.character_id) || AV2_ST[r.status] !== 1 || ztHas(rid, r.character_id)) return 'cast:av2.retired';
      rid[r.character_id] = 1; if (ztHas(ents, r.character_id) && !ex1Sub(r, ents[r.character_id], 0)) return 'cast:av2.retired'; }   /* ★r6: 写しは cast の行の部分集合 */
    var kn = ztHas(a, 'known') ? a.known : {};
    if (!ex1Plain(kn)) return 'cast:av2.known';
    for (k in kn) { if (!ztHas(kn, k)) continue; var sn = kn[k];
      if (!AV2_CID.test(k) || !ex1Plain(sn) || ztHas(sn, 'character_id') || ztHas(rid, k)) return 'cast:av2.known';
      if (ztHas(ents, k) && !ex1Sub(sn, ents[k], 0)) return 'cast:av2.known'; }   /* ★r6: 写しは cast の行の部分集合（cast の行にだけある欄＝voice など後から付いた欄は許す） */
    return null;
  }
  function ex1Cat(id, env) {
    var b = J(g(env, 'chr6_slot_' + id), null);
    if (!b || typeof b !== 'object' || isArr(b)) return 'body:unreadable';
    for (var k in b) if (ztHas(b, k) && ZT_TOP[k] !== 1) return 'top:unknown';
    var c = b.cfg, nT = isArr(b.turns) ? b.turns.length : -1;
    if (c != null) {
      if (typeof c !== 'object' || isArr(c)) return 'cfg:not-object';
      for (var k2 in c) { if (!ztHas(c, k2) || ZT_CFG_HASHED[k2] === 1) continue; if (ex1Ok(k2, c[k2], nT, id, env)) continue; return ztHas(EX1_NAMES, k2) ? 'cfg:' + k2 : 'cfg:unknown'; }
    }
    var ca = b.cast; if (ca && typeof ca === 'object' && !isArr(ca) && ztHas(ca, 'av2')) { var aw = ex1Av2(id, ca); if (aw) return aw; }   /* ★EXTRA1 r5 */
    return null;
  }
  /* ★ZT1c（GPT #127-VP 1・案 a。SMOKE31: ふつうに作った 0 ターンの物語が全部 zero-turn-extra）: ZT1 の経路（0 ターン）の hash 対象外の検査を、
     r1 の「既定値だけ」（zt1Extra）から EXTRA1 r6 と同じ許可リスト（ex1Cat）へ切り替える。型・置き場所・値の形を確かめる。
     コードが入れる固定の印: orKey / pollKey の '__proxy__'（fix247 / fix328 / fix336 / fix886）・provider 'openrouter'（同）・aiAvatar true（fix355）・artStyle 6（fix374 / fix395）。
     BYOK のキーは EXTRA1 r4 と同じ（生きている物語が同じ値を持つ写しのときだけ・Vault で隠した物語は相手にしない・集合が分からなければ認めない・値は出さない）。
     cast.av2（開始時の絵）は EXTRA1 r6 の部分集合の規則。_spiceT は 0 ターンなので 0 だけ。外れたら今までどおり 'zero-turn-extra'（理由の種類は dry-run の zeroTurnExtra.byKey）。
     EXTRA1 の kill（v292DfixEXTRA1Off）とは独立（ZT1 の検査は止めない）。zt1Extra は残す（使わない）。 */
  function zt1Chk(id, env) {
    var cat = ex1Cat(id, env); if (!cat) return null;
    if (typeof env.onExtra === 'function') { try { env.onExtra(id, 'zt:' + cat, 'subset'); } catch (eO) {} }   /* ZT1 の証明は class c を残す（r2）ので subset で数える */
    return ZT_EXTRA;
  }
  function exPost(id, env, se, need) {
    if (!env || env.extra1 === false) return null;
    if ((need && need.zt1 === true) || (se && se.zeroTurn === true)) return null;   /* ZT1 の経路は zt1Extra で先に確かめた */
    if (g(env, 'chr6_slot_' + id) == null) return null;
    var cat = ex1Cat(id, env); if (!cat) return null;   /* ★EXTRA1 r3: 名前を挙げた設定だけ許す */
    if (typeof env.onExtra === 'function') { try { env.onExtra(id, cat, need ? 'subset' : 'full'); } catch (eO) {} }   /* dry-run の数だけ */
    return EX_WHY;
  }
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
    'chr6_v292Dfix135_sum_slot_': 'c', 'chr6_v292Dfix135_last_slot_': 'c', 'chr6_v292Dfix136_wi_slot_': 'c', 'chr6_v292Dfix137_ev_slot_': 'c', 'v292DfixMEM4_slot_': 'c',   /* ★MEM4: 記憶の印は記憶と同じ扱い */   /* 長期記憶（AI 生成） */
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
    if (env.zt1Dirty !== true) return false;   /* ★ZT1b: 印が DIRTY の物語は v292DfixZT1DirtyOn='1' のときだけ（既定は除外） */
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
    if (staleDirtyLocal(id, env, row, mo)) return { title: row.title };
    return zt1DirtyLocal(id, env, row, mo) ? { title: row.title, zt1: true } : null;   /* ★ZT1b: ZT1 から来た（zt1Extra を確かめる） */
  }
  /* サーバーの墓標の hash とこの端末の内容が同じか。null = 確認不要か一致 / 理由コード = 一致を確かめられない */
  function stuckProof(id, env, se) {
    var need = stuckNeeds(id, env);
    if (!need && se && se.zeroTurn === true) {   /* ★ZT1: 印が CLEAN でも 0 ターンの墓標は hash の一致を必ず確かめる（dirtyProven にはしない） */
      var zr = zt1Row(id, env);
      if (!zr || typeof zr.title !== 'string' || !HEX64.test(String(se.serverHash || ''))) return Promise.resolve('zero-turn-unproven');
      var zx0 = zt1Chk(id, env); if (zx0) return Promise.resolve(zx0);   /* ★ZT1b ／ ★ZT1c: EXTRA1 r6 と同じ許可リスト */
      return Promise.resolve().then(function () { return env.dirtyProof(id, zr.title, String(se.serverHash), dpo(se)); })
        .then(function (why) { if (why == null) { se.zeroTurnProven = true; return null; } return 'zero-turn-unproven'; }, function () { return 'zero-turn-unproven'; });
    }
    if (!need) return Promise.resolve(null);
    if (se && se.zeroTurn === true && need.zt1 !== true && env.zt1Dirty !== true) return Promise.resolve('zero-turn-dirty');   /* ★ZT1d（SMOKE33）: 0 ターンの墓標（ZT1 が開く経路）では、印が DIRTY の物語は v292DfixZT1DirtyOn のときだけ。STUCK1（staleDirtyLocal）・FREE2 の証明（free2Proof）から来ても同じ */
    if (need.zt1 === true || (se && se.zeroTurn === true)) { var zx1 = zt1Chk(id, env); if (zx1) return Promise.resolve(zx1); }   /* ★ZT1b ／ ★ZT1c */
    if (!HEX64.test(String(se && se.serverHash || ''))) return Promise.resolve('unsynced-unproven');
    if (need.free2) {   /* ★FREE2: サーバーの墓標が証明の時のまま（hash・rev）で、いまの端末の全体がその hash と同じ。title はサーバーの墓標のもの */
      if (String(se.serverHash) !== need.free2.h || se.rev !== need.free2.rev || typeof se.title !== 'string') return Promise.resolve('unsynced-unproven');
      return Promise.resolve().then(function () { return env.dirtyProof(id, se.title, String(se.serverHash), dpo(se)); })
        .then(function (why) { if (why == null) { var xw0 = exPost(id, env, se, need); if (xw0) return xw0; se.dirtyProven = true; se.free2 = true; return null; } return 'unsynced-unproven'; }, function () { return 'unsynced-unproven'; });   /* (dirtyProof の第 4 引数は下で付ける) */
    }
    return Promise.resolve().then(function () { return env.dirtyProof(id, need.title, String(se.serverHash), dpo(se)); })
      .then(function (why) { if (why == null) { var xw1 = exPost(id, env, se, need); if (xw1) return xw1; se.dirtyProven = true; if (se.zeroTurn === true) se.zeroTurnProven = true; return null; } return se.zeroTurn === true ? 'zero-turn-unproven' : 'unsynced-unproven'; }, function () { return se.zeroTurn === true ? 'zero-turn-unproven' : 'unsynced-unproven'; });
  }
  function vaultBlock(id, env) {
    if (env && env.vcAllow && env.vcAllow[String(id)] === 1) return vcPassOnly(String(id), env);   /* ★VCLEAN1: この実行で確かめた id だけ（隠し一覧の判定だけを外す。パスコードは見る） */
    if (env && typeof env.vu === 'function') { var uv = env.vu(String(id)); if (uv === 'vault') return 'vault'; if (uv === 'hold') return 'vault-v2-pending'; }   /* ★VAULTUNI1: VAULTGATE2 の共通判定（分からない → 今は消さない・読まない） */
    if (env && env.vg && env.vg.ids && env.vg.ids[String(id)] === 1) return 'vault';   /* ★VAULTGUARD1: Vault v2 で隠している（解錠中で fix889 の一覧から外れていても） */
    if (env && env.vcV2 && env.vcV2[String(id)] === 1) return 'vault';   /* ★VCLEAN1（鍵があるときだけ）: Vault v2 で隠している（解錠中は fix889 の一覧から外れるので、v2 の一覧でも見る＝本文を取り寄せる通常の経路へ流さない） */
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
  function vcPassOnly(id, env) {
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
    if (env.vgKill && env.vgKill.state !== 'none') return 'vaultguard-off-vault2';   /* ★VGUARD2（GPT #127-VN 2・案 b）: VAULTGUARD1 を kill した端末で Vault v2 がある・状態が分からない → 通常の getstory 照合を全部休む */
    if (env.vg && env.vg.state === 'unknown') return 'vault2-ids-unknown';   /* ★VAULTGUARD1: 解錠中なのに Vault v2 の隠した id が分からない → 全部止める（getstory をしない） */
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
  /* ★ZT1b r2: 本体が無く、class c（形の分からない family を含む）だけが端末に残る削除済みの物語の数・鍵の数・字数（読むだけ・消さない）。
     Vault で隠した物語は値を読まずに数だけ飛ばす。同期の印は数えない。 */
  function cOnlyCount(env) {
    var out = { stories: 0, keys: 0, chars: 0, vaultSkipped: 0 }, ids = candidates(env);
    if (env.ex1Vault !== undefined && !exVaultKnown(env)) { out.vaultUnknown = true; return out; }   /* ★r4: 隠した物語の集合が分からない → 1 つも読まない */
    for (var i = 0; i < ids.length; i++) { var id = ids[i];
      if (env.ex1Vault !== undefined ? exHidden(id, env) : vaultBlock(id, env)) { out.vaultSkipped++; continue; }
      var pl = planOne(id, env); if (pl.body !== 'absent') continue;
      var n = 0, ch = 0;
      for (var j = 0; j < pl.keys.length; j++) { var k = pl.keys[j]; if (k === 'v292Dfix402_f781g_' + id || pl.vals[j] == null) continue;
        var s = env.key1 && env.key1.storyOf(k), cls = s ? familyClass(s.family) : 'c'; if (cls === 'c') { n++; ch += k.length + pl.vals[j].length; } }
      if (n) { out.stories++; out.keys += n; out.chars += ch; } }
    return out;
  }
  /* ★EXTRA1 r3: free2DryRun の中身（読むだけ・消さない・書かない）。proof-extra の物語の数・鍵の名前の種類ごとの数・それで残る字数（見込み） */
  function f2DryTally(e, cx) {
    var o = { v: F2_VERSION, on: e.free2 === true, mode: e.purge ? 'purge' : 'r2', at: e.now(), candidates: 0, freeable: { stories: 0, keys: 0, chars: 0, viaProof: 0 }, excluded: { stories: 0, byReason: {} }, global: null,
              proofExtra: { stories: 0, chars: 0, byKey: {} }, zeroTurnExtra: { stories: 0, chars: 0, byKey: {} } };   /* ★ZT1c: ZT1 の外れ（数だけ） */
    var glob = null, seen = {}; e.onReason = function (sid, w) { if (sid === '*') glob = String(w); };
    e.onExtra = function (sid, cat, mode) { if (seen[sid]) return; seen[sid] = 1; var zt = String(cat).indexOf('zt:') === 0, P = zt ? o.zeroTurnExtra : o.proofExtra; if (zt) cat = String(cat).slice(3); P.stories++; P.byKey[cat] = (P.byKey[cat] || 0) + 1;
      try { var pl = planOne(sid, e); P.chars += (mode === 'subset') ? applySubset(pl, provenSubset(sid, e, pl)).chars : pl.chars; } catch (eP) {} };
    return (e.purge ? surveyP : survey)(e, cx).then(function (rep) {
      o.candidates = rep.candidates || 0; o.global = glob;
      try { o.cOnly = cOnlyCount(e); } catch (eC) { o.cOnly = null; }
      o.willKeepC = { stories: 0, chars: 0 }; for (var i0 = 0; i0 < rep.eligible.length; i0++) if (rep.eligible[i0].keptC) { o.willKeepC.stories++; o.willKeepC.chars += +rep.eligible[i0].keptCChars || 0; }
      for (var i = 0; i < rep.eligible.length; i++) { var x = rep.eligible[i]; o.freeable.stories++; o.freeable.keys += +x.keys || 0; o.freeable.chars += +x.chars || 0; if (x.dirtyProven === true) o.freeable.viaProof++; }
      for (var k in rep.skipped) if (Object.prototype.hasOwnProperty.call(rep.skipped, k) && k !== glob) { o.excluded.byReason[k] = rep.skipped[k]; o.excluded.stories += rep.skipped[k]; }
      return o;
    }, function () { o.failed = true; return o; });
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
      .then(function (why) { if (why == null) { var xw2 = exPost(id, env, se, null); if (xw2) return xw2; se.tombHashMatched = true; return null; } return why === 'content-differs' ? 'tomb-hash-mismatch' : 'tomb-hash-unproven'; }, function () { return 'tomb-hash-unproven'; });
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
          var pq = (se.dirtyProven === true || se.zeroTurnProven === true) ? applySubset(pl, provenSubset(id, env, pl)) : pl;   /* ★STUCK1 r2: c は残す（★ZT1b r2: ZT1 の証明は印が CLEAN でも c を残す） */
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
        if (se.dirtyProven === true || se.zeroTurnProven === true) { o.keptC = pq.keptC; o.keptCChars = pq.keptCChars; } return o; }   /* ★ZT1b r2 */
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
      if (se.dirtyProven === true || se.zeroTurnProven === true) { pl = applySubset(pl, provenSubset(id, env, pl)); if (!pl.keys.length) return fin('nothing-left'); out.keptC = pl.keptC; out.markerKept = pl.markerKept; }   /* ★ZT1b r2 */
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
  var COUNT_ONLY = { vault: 1, passcode: 1, 'vault-v2-pending': 1, 'vault-cache-unreadable': 1, 'vault-unavailable': 1, 'vault-state-unknown': 1, 'vault-check-threw': 1,
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
  /* ======================================================================
   * ★DISCARD1（Owner 承認 2026-11-15 12:29「二度と元に戻せなくなってもよいので消してよい」・GPT #127-UB / #127-UD）
   *   手動専用。自動では動かない（呼ばれたときだけ）。UI なし。FREE2 の通常の判定（judgeOne）は 1 文字も緩めない。
   *   対象: 通常の確認（survey）で「サーバーの内容と同じと確かめられなかった」理由（D1_OVERRIDE）で残った写しだけ。そのうえで
   *     ・その場で getstory（公式の読み取り）がサーバーの墓標（deleted===true・id 一致・locked でない）を返した
   *     ・Vault / パスコードに関わらない（vaultBlock）・別アカウントの印なし
   *     ・活動中でない: chr6_active_slot がその id でない・lastOpenedAt 10 分以内でない・story-open の Lock を誰も持っていない
   *     ・未同期でない: 同期の印が無いか CLEAN（送信中でない）・f911 / f697p / 945_rescue なし・dl2conflict・fix750・削除の計画が開いていない・この画面の保存が送信中でない
   *     ・旧 id でない・保護 id でない
   *   消すキー: FREE2 の解放と同じ planOne（purgeList＝サイド・本体・同期の印。snapshot・控え・未送信の写しは残す）。meta の墓標は残す（復活を止める根拠）。
   *   返すのは件数・字数・理由ごとの件数・id の短い指紋（h53 の先頭 8 字）だけ。題名・本文・鍵名は返さない。
   *   kill: v292DfixDISCARD1Off='1'（fix562 も断る）・v292DfixSTORE1Off='1'。
   * ====================================================================== */
  var D1_ACK = 'OWNER-ACK-20261115', D1_KILL = 'v292DfixDISCARD1Off', D1_LOGK = 'v292DfixDISCARD1Log', D1_MAX_DEFAULT = 5, D1_MAX_CAP = 50;
  var D1_OVERRIDE = { 'server-body-not-held': 1, 'tomb-hash-mismatch': 1, 'tomb-hash-unproven': 1, 'content-mismatch': 1, 'server-body-behind': 1,
                      'local-body-unreadable': 1, 'local-body-missing': 1, 'zero-turn-unproven': 1 };
  function d1Cat(why) {
    var w = String(why || '');
    if (/^vault|^passcode$|^server-locked$/.test(w)) return 'vault';
    if (/^(active-slot|recently-opened|open-in-tab|locks-unavailable|open-lock-off)$/.test(w)) return 'active';
    if (/^(unsynced|unsynced-unproven|in-flight|stash|journal|rescue|marker-unreadable|marker-id-mismatch|conflict|conflict-unreadable|mat-journal|mat-journal-unreadable|restore-hold)$/.test(w)) return 'unsynced';
    if (/^(delete-plan-open|pending-unreadable)$/.test(w)) return 'pending-delete';
    if (/^(no-tombstone|live-row|dup-tombstone|server-404|server-live|server-id-mismatch|foreign|foreign-check-threw|meta-unreadable)$/.test(w)) return 'no-tombstone';
    if (/^(id-shape|protected)$/.test(w)) return 'legacy';
    if (w === 'nothing-left') return 'nothing-left';
    return 'network';   /* server-unreachable / server-not-ok / server-authority / server-rev / no-account / principal-changed / 判断できないもの */
  }
  /* DISCARD1 だけの厳しいローカルの条件（値を読むのは印・meta・関門の鍵だけ）。null = 通過 */
  function d1Local(id, env) {
    id = String(id);
    if (!ID_RE.test(id)) return 'id-shape';
    if (PROTECT[id] === 1) return 'protected';
    var vb = vaultBlock(id, env); if (vb) return vb;
    var meta = metaRows(env); if (!meta) return 'meta-unreadable';
    var tomb = 0, live = 0, row = null;
    for (var i = 0; i < meta.length; i++) { var e = meta[i]; if (!e || String(e.id) !== id) continue; if (e.deleted === true) { tomb++; row = e; } else live++; }
    if (live) return 'live-row';
    if (tomb !== 1) return tomb ? 'dup-tombstone' : 'no-tombstone';
    try { if (env.iso2Foreign && env.iso2Foreign(id)) return 'foreign'; } catch (e3) { return 'foreign-check-threw'; }
    var act = g(env, 'chr6_active_slot');
    if (act != null && (act === id || J(act, null) === id)) return 'active-slot';   /* FREE2 の緩め（墓標の物語は理由にしない）は使わない */
    var lo = row && row.lastOpenedAt ? Date.parse(row.lastOpenedAt) : 0;
    if (lo && env.now() - lo < RECENT_OPEN_MS) return 'recently-opened';
    var mk = g(env, 'v292Dfix402_f781g_' + id);
    if (mk != null) { var mo = J(mk, null); if (!mo || typeof mo !== 'object') return 'marker-unreadable';
      if (String(mo.state || '') !== 'CLEAN') return 'unsynced';
      if (mo.inFlightSave) return 'in-flight';
      if (mo.storyId != null && String(mo.storyId) !== id) return 'marker-id-mismatch'; }
    if (g(env, 'v292Dfix402_f911_' + id) != null) return 'stash';
    if (g(env, 'v292Dfix402_f697p_' + id) != null) return 'journal';
    if (g(env, 'v292Dfix945_rescue_' + id) != null) return 'rescue';
    var cf = g(env, 'v292Dfix587_dl2conflict');
    if (cf != null) { var co = J(cf, null); if (!co || typeof co !== 'object') return 'conflict-unreadable'; if (Object.prototype.hasOwnProperty.call(co, id)) return 'conflict'; }
    var mt = g(env, 'v292Dfix750_matTxn');
    if (mt != null) { var to = J(mt, null); if (!to || typeof to !== 'object') return 'mat-journal-unreadable'; if (String(to.storyId) === id || String(to.slotId) === id) return 'mat-journal'; }
    var pd = g(env, 'v292Dfix587_pending');
    if (pd != null) { var pa = J(pd, null); if (!isArr(pa)) return 'pending-unreadable';
      for (var p = 0; p < pa.length; p++) { var pl = pa[p]; if (!pl) continue; if (String(pl.slotId) !== id && String(pl.storyId || '') !== id) continue;
        if (!(pl.sdTerminal === true && (pl.sdResolution === 'SERVER_TOMBSTONED_BY_DL2' || pl.sdResolution === 'SERVER_TOMBSTONED_BY_LDR'))) return 'delete-plan-open'; } }
    if (typeof env.saveBusy === 'function') { var sb = true; try { sb = !!env.saveBusy(id); } catch (eB) { sb = true; } if (sb) return 'in-flight'; }
    return null;
  }
  /* サーバーの墓標の確認（その場の getstory）。本文の有無・内容は見ない */
  function d1Server(id, r) {
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
    return { why: null, rev: j.rev, authority: j.authority };
  }
  /* 一覧（何も消さない・書かない）: 通常の survey（FREE2 の判定・同じ通信）→ 確かめられなかった理由の物語だけ DISCARD1 の条件を見る */
  function d1Survey(env, ctx) {
    var why = {}, glob = null, e2 = {};
    for (var k0 in env) if (Object.prototype.hasOwnProperty.call(env, k0)) e2[k0] = env[k0];
    e2.onReason = function (sid, w) { if (sid === '*') glob = String(w); else if (why[String(sid)] == null) why[String(sid)] = String(w); };
    e2.only = null; e2.purge = false;
    var out = { v: 'DISCARD1-r1', at: env.now(), candidates: 0, targets: [], chars: 0, excluded: { vault: 0, active: 0, unsynced: 0, 'pending-delete': 0, 'no-tombstone': 0, network: 0, legacy: 0, 'free2-eligible': 0, 'nothing-left': 0 }, global: null };
    function ex(c) { out.excluded[c] = (out.excluded[c] || 0) + 1; }
    return survey(e2, ctx).then(function (rep) {
      var ids = candidates(e2), el = {}; out.candidates = ids.length; out.global = glob;
      for (var i = 0; i < rep.eligible.length; i++) el[String(rep.eligible[i].id)] = 1;
      var pend = [];
      for (var j = 0; j < ids.length; j++) { var id = ids[j];
        if (el[id]) { ex('free2-eligible'); continue; }
        var w = why[id] || glob || 'not-reached';
        if (D1_OVERRIDE[w] !== 1) { ex(d1Cat(w)); continue; }
        var lw = d1Local(id, env); if (lw) { ex(d1Cat(lw)); continue; }
        pend.push({ id: id, ask: (w === 'local-body-unreadable' || w === 'local-body-missing') }); }   /* 本文の関門で止まった物語は survey が getstory していない → ここで聞く */
      if (glob) { for (var q = 0; q < pend.length; q++) ex('network'); return out; }
      var chain = Promise.resolve();
      pend.forEach(function (pq) { var id = pq.id; chain = chain.then(function () {
        var pl = planOne(id, env); if (!pl.keys.length) { ex('nothing-left'); return; }
        return (pq.ask ? Promise.resolve(ctx.getStory(id)).then(function (r) { return d1Server(id, r).why; }, function () { return 'server-unreachable'; }) : Promise.resolve(null)).then(function (sw) {
          if (sw) { ex(d1Cat(sw)); return; }
          return Promise.resolve(ctx.lockHeld(id)).then(function (h) { if (h !== false) { ex('active'); return; }
            out.targets.push({ id: id, keys: pl.keys.length, chars: pl.chars }); out.chars += pl.chars; }); }); }); });
      return chain.then(function () { return out; });
    });
  }
  function d1Short(id) { return h53(String(id)).replace(':', '').slice(0, 8); }
  /* 1 物語を捨てる（Lock の中で、関門・計画・getstory・アカウントを取り直す） */
  function d1One(id, env, ctx) {
    id = String(id);
    var out = { ok: false, code: null, removed: 0, chars: 0 };
    function fin(c) { out.code = c; return out; }
    var gb = globalBlock(env); if (gb) return Promise.resolve(fin(gb));
    var lb = d1Local(id, env); if (lb) return Promise.resolve(fin(lb));
    var pl = planOne(id, env); if (!pl.keys.length) return Promise.resolve(fin('nothing-left'));
    return Promise.resolve(ctx.who()).then(function (a0) {
      if (!a0) return fin('no-account');
      return Promise.resolve(ctx.lockHeld(id)).then(function (h) {
        if (h !== false) return fin(h === true ? 'open-in-tab' : 'locks-unavailable');
        return Promise.resolve(ctx.withOpenLock(id, function () {
          return Promise.resolve(ctx.who()).then(function (a1) {
            if (!a1 || a1 !== a0) return fin('principal-changed');
            var gb2 = globalBlock(env) || d1Local(id, env); if (gb2) return fin(gb2);
            var sp2 = samePlan(pl, planOne(id, env)); if (sp2) return fin(sp2);
            return Promise.resolve(ctx.getStory(id)).then(function (r) {
              var se = d1Server(id, r); if (se.why) return fin(se.why);
              var issuedAt = env.now();
              return Promise.resolve(ctx.who()).then(function (a2) {
                if (!a2 || a2 !== a0) return fin('principal-changed');
                return Promise.resolve(ctx.withMatLock(function () {
                  var gb3 = globalBlock(env) || d1Local(id, env); if (gb3) return fin(gb3);
                  var sp3 = samePlan(pl, planOne(id, env)); if (sp3) return fin(sp3);
                  var I = env.inv, G = env.gate;
                  if (!I || typeof I.deletePolicy !== 'function' || typeof I.discard1Arm !== 'function' || typeof I.discard1Disarm !== 'function' || typeof I._hash !== 'function') return fin('policy-unavailable');
                  if (!G || typeof G.tryDeleteExact !== 'function') return fin('gate-unavailable');
                  var proof = { v: 1, kind: 'DISCARD1', ack: D1_ACK, runId: 'd1-' + issuedAt + '-' + (++runSeq), storyId: id, accountId: a0, accountIdAfter: a2,
                                serverRev: se.rev, serverDeleted: true, authority: se.authority, issuedAt: issuedAt,
                                keys: pl.keys.map(function (k, j) { return { key: k, bytes: pl.vals[j].length, hash: I._hash(pl.vals[j]), value: pl.vals[j] }; }) };
                  var armed = I.discard1Arm(proof); if (!armed) return fin('arm-refused');
                  try {
                    for (var q = 0; q < pl.keys.length; q++) {
                      var k = pl.keys[q], cur = g(env, k);
                      if (cur == null) continue;
                      if (cur !== pl.vals[q]) return fin('value-changed-mid');
                      var pol = I.deletePolicy({ key: k, value: cur, intent: 'device-discard', discard1Proof: armed });
                      if (!pol || pol.allow !== true || pol.code !== 'device-discard-verified') { out.policyWhy = pol && (pol.discardWhy || pol.code); return fin('policy-refused'); }
                      var b = pol.binding || {};
                      if (b.key !== k || b.bytes !== cur.length || b.hash !== I._hash(cur) || b.storyId !== id || b.runId !== armed.runId) return fin('binding-mismatch');
                      var rr = null; try { rr = G.tryDeleteExact({ key: k, expectedBytes: cur.length, expectedHash: b.hash, intent: 'device-discard', path: 'DISCARD1', reason: 'device-discard' }); } catch (eG) { rr = null; }
                      if (!rr || rr.ok !== true || rr.deleted !== true || g(env, k) != null) { out.gateCode = rr && rr.code; return fin('gate-refused'); }
                      out.removed++; out.chars += k.length + cur.length;
                    }
                  } finally { try { I.discard1Disarm(); } catch (eD) {} }
                  out.ok = true; return fin('discarded');
                })).then(function (m) { if (!m || m.granted !== true) return fin(m && m.api === false ? 'locks-unavailable' : 'lock-busy'); if (m.threw) return fin('threw'); return m.value; });
              });
            }, function () { return fin('server-unreachable'); });
          });
        })).then(function (x) { if (!x || x.granted !== true) return fin(x && x.api === false ? 'locks-unavailable' : 'open-in-tab'); if (x.threw) return fin(out.code || 'threw'); return x.value; });
      });
    }).then(null, function () { return fin('threw'); });
  }
  /* 実行: ack が違えば何もしない。dryRun と同じ確認で対象を選び、先頭から max 件まで 1 件ずつ。最初の失敗で止める */
  function d1Run(opts, env, ctx) {
    var res = { v: 'DISCARD1-r1', ok: false, code: null, freed: 0, chars: 0, failed: 0, notProcessed: 0, failedCode: null, freedIds: [] };
    if (!opts || opts.ack !== D1_ACK) { res.code = 'ack-mismatch'; return Promise.resolve(res); }
    if (g(env, D1_KILL) === '1') { res.code = 'killed'; return Promise.resolve(res); }
    var max = (opts.max == null) ? D1_MAX_DEFAULT : Math.floor(+opts.max);
    if (!(max >= 1)) { res.code = 'bad-max'; return Promise.resolve(res); }
    if (max > D1_MAX_CAP) max = D1_MAX_CAP;
    return d1Survey(env, ctx).then(function (s) {
      var list = s.targets.slice(0, max); res.notProcessed = s.targets.length - list.length; var i = 0;
      function next() {
        if (i >= list.length) { res.ok = true; res.code = list.length ? 'done' : 'nothing-to-do'; return res; }
        var id = list[i++];
        return d1One(id.id, env, ctx).then(function (x) {
          if (x.ok) { res.freed++; res.chars += x.chars; res.freedIds.push(d1Short(id.id)); return next(); }
          res.failed = 1; res.failedCode = x.code; res.chars += x.chars || 0; res.notProcessed += list.length - i; res.code = 'stopped'; if (x.policyWhy) res.policyWhy = String(x.policyWhy); return res;
        });
      }
      return next();
    });
  }
  /* ======================================================================
   * ★DISCARD2（GPT #127-UL・Owner 承認 2026-11-15 12:29 の範囲）: 削除済みの物語のスナップショット（chr6_snap_ / chr6_snapd_）を捨てる。手動専用・UI なし・自動経路なし。
   *   所属 id は KEY1（^chr6_snap_<id>_<時刻>$ / ^chr6_snapd_<id>_<時刻>_<n>$。id に _ は無い）で完全一致に決める。時刻ごとの組（manifest＋実体）に分け、
   *   manifest が読めない・id / slotId が鍵と合わない・実体の鍵が同じ組でない・ほかの物語の manifest がその鍵を指している → その組は unknown-owner（消さない）。
   *   KEY1 で持ち主が決まらないスナップショット系の鍵も unknown-owner として数えるだけ。
   *   物語の条件: 本体 chr6_slot_<id> が無い（あれば live）＋ DISCARD1 の d1Local（Vault・墓標の行がちょうど 1・別アカウント・最後に開いた・10 分以内・
   *   印が CLEAN でない・送信中・f911 / f697p / rescue・conflict・fix750・削除の計画・この画面の送信中・旧 id）＋ story-open の Lock。
   *   Run だけが物語ごとに Lock の中で getstory（deleted===true）を取り直し、計画（鍵と値）とほかのタブの書き込みを確かめてから、実体 → manifest の順に
   *   fix562（intent 'snapshot-discard'）→ fix569 tryDeleteExact で 1 本ずつ消す。meta の墓標・chr6_bk_・__gen_・本体・サイドストアには触らない（fix562 も断る）。
   *   スナップショットの一覧は manifest の列挙そのもの（fix564.list）なので、組ごと消せば一覧と実体は合ったまま。生きている物語の組には触らない。
   *   kill: v292DfixDISCARD2Off='1'（fix562 も断る）・v292DfixSTORE1Off='1'。
   * ====================================================================== */
  var D2_KILL = 'v292DfixDISCARD2Off', D2_LOGK = 'v292DfixDISCARD2Log';
  function d2Re(id) { var e = String(id).replace(/[^A-Za-z0-9]/g, ''); return { man: new RegExp('^chr6_snap_' + e + '_(\\d+)$'), part: new RegExp('^chr6_snapd_' + e + '_(\\d+)_(\\d+)$') }; }
  /* 端末のスナップショット系の鍵を持ち主ごとに（名前だけ・値は読まない） */
  function d2Owners(env) {
    var K = env.key1, ks = allKeys(env), by = {}, unknownKeys = 0;
    for (var i = 0; i < ks.length; i++) { var k = ks[i]; if (k.indexOf('chr6_snap_') !== 0 && k.indexOf('chr6_snapd_') !== 0) continue;
      var s = K && K.storyOf(k); if (!s || s.kind !== 'snapshot' || !s.id) { unknownKeys++; continue; } (by[s.id] = by[s.id] || []).push(k); }
    return { by: by, unknownKeys: unknownKeys };
  }
  /* ほかの物語の manifest が指している実体の鍵（Vault に関わる物語の manifest は読まない） */
  function d2Refs(env, owners, exceptId) {
    var ref = {};
    for (var id in owners.by) { if (id === exceptId) continue; var vb = null; try { vb = vaultBlock(id, env); } catch (e) { vb = 'x'; } if (vb) continue;
      var arr = owners.by[id]; for (var i = 0; i < arr.length; i++) { if (arr[i].indexOf('chr6_snap_') !== 0) continue; var m = J(g(env, arr[i]), null);
        if (m && m.parts && typeof m.parts === 'object') for (var lk in m.parts) { var sk = m.parts[lk] && m.parts[lk].snapKey; if (typeof sk === 'string') ref[sk] = 1; } } }
    return ref;
  }
  /* その物語の組（消せる組の鍵と、unknown-owner の組の数） */
  function d2Plan(id, env, owners, refs) {
    var R = d2Re(id), arr = (owners.by[id] || []).slice().sort(), grp = {}, out = { keys: [], vals: [], chars: 0, groups: 0, unknownGroups: 0, unknownKeys: 0 };
    for (var i = 0; i < arr.length; i++) { var k = arr[i], m1 = R.man.exec(k), m2 = R.part.exec(k), ts = m1 ? m1[1] : (m2 ? m2[1] : null);
      if (ts == null) { out.unknownKeys++; continue; } var gp = grp[ts] || (grp[ts] = { man: null, parts: [] }); if (m1) gp.man = k; else gp.parts.push(k); }
    var tss = Object.keys(grp).sort();
    for (var t = 0; t < tss.length; t++) { var gp2 = grp[tss[t]], bad = false, vals = {};
      if (gp2.man) { var raw = g(env, gp2.man), m = J(raw, null);
        if (!m || typeof m !== 'object' || String(m.id) !== gp2.man || String(m.slotId) !== String(id) || !m.parts || typeof m.parts !== 'object') bad = true;
        else for (var lk in m.parts) { var sk = m.parts[lk] && m.parts[lk].snapKey; var mm = typeof sk === 'string' ? R.part.exec(sk) : null; if (!mm || mm[1] !== tss[t]) { bad = true; break; } }
        vals[gp2.man] = raw; }
      for (var p = 0; p < gp2.parts.length && !bad; p++) { if (refs[gp2.parts[p]]) bad = true; }
      if (bad) { out.unknownGroups++; out.unknownKeys += gp2.parts.length + (gp2.man ? 1 : 0); continue; }
      gp2.parts.sort(); var order = gp2.parts.concat(gp2.man ? [gp2.man] : []);   /* 実体 → manifest（途中で止まっても manifest が残り、次の実行で続きを片づける） */
      for (var q = 0; q < order.length; q++) { var v = vals[order[q]] !== undefined ? vals[order[q]] : g(env, order[q]); out.keys.push(order[q]); out.vals.push(v); out.chars += order[q].length + (v == null ? 0 : v.length); }
      out.groups++; }
    if (env.acGen === true && g(env, 'chr6_slot_' + id) == null) { var gk = '__gen_chr6_slot_' + id, gv = g(env, gk);   /* ★GEN1 r3 (c) */
      if (gv != null) { if (acGenOK(id, env, gv)) { out.keys.push(gk); out.vals.push(gv); out.chars += gk.length + gv.length; out.gen = 1; } else { out.genKept = 1; } } }
    return out;
  }
  /* ★GEN1 r3 (c)（GPT #127-UT 1(c)）: AUTOCLEAN1 の段 2 で、本体の写しが無い削除済みの物語の __gen_ も捨てる対象に足す。
     AUTOCLEAN1 の実行（env.acGen）のときだけ。r4: 専用の On 鍵 v292DfixGEN1cOn='1'（既定 OFF）も要る。鍵 __gen_chr6_slot_<id> の完全一致・アカウントが確定し iso2 の持ち主の記録が一致・
     世代が読めて別の物語の指紋が無い・Vault／パスコードでない、の全部が確かめられたときだけ。手動の DISCARD2 は変わらない。kill: v292DfixGEN1cOff='1' */
  function acGenOK(id, env, gv) {
    try { if (g(env, 'v292DfixGEN1cOff') === '1' || g(env, 'v292DfixGEN1cOn') !== '1') return false; if (vaultBlock(String(id), env)) return false;
      var I = env.iso2 || (root && root.__v292Diso2); if (!I || typeof I.owner !== 'function' || typeof I.stampOf !== 'function') return false;
      var o = I.owner(); if (!o || o.bad || typeof o.now !== 'string' || !o.now || !o.docKind || o.docKind === 'anon' || o.docKind === 'conflict' || (o.doc && o.doc !== o.now)) return false;
      var sp = I.stampOf(id, 's'); if (!sp || typeof sp.c !== 'string' || sp.c !== o.now || (sp.w != null && sp.w !== o.now)) return false;
      var a = J(gv, null); if (!isArr(a) || !a.length) return false;
      for (var i = 0; i < a.length; i++) { var x = a[i]; if (!x || typeof x.data !== 'string') return false; var d = J(x.data, null); if (!d || typeof d !== 'object') return false;
        var c = [d.slotId, d.storyId, d._slot, d.cfg && d.cfg.slotId, d.cfg && d.cfg.storyId, d.scene && d.scene.slotId, d.scene && d.scene.storyId];
        for (var j = 0; j < c.length; j++) if (typeof c[j] === 'string' && c[j] && c[j] !== String(id) && c[j] !== 'chr6_slot_' + id) return false; }
      return true; } catch (e) { return false; }
  }
  function d2Local(id, env) {
    if (!ID_RE.test(String(id))) return 'id-shape';
    if (PROTECT[String(id)] === 1) return 'protected';
    if (g(env, 'chr6_slot_' + id) != null) { var mr = metaRows(env) || [], dl = false; for (var i = 0; i < mr.length; i++) if (mr[i] && String(mr[i].id) === String(id) && mr[i].deleted === true) dl = true; return dl ? 'body-present' : 'live'; }   /* r2: 削除済みだが本体の写しがまだある（FREE2 / DISCARD1 が先） */
    var w1 = d1Local(id, env); if (w1) return w1;
    return cLeft(id, env) ? 'c-kept' : null;   /* ★ZT1b r2: class c が残る間はスナップショットも残す（印が DIRTY のときの 'unsynced' と同じ扱い） */
  }
  function cLeft(id, env) { var kf = keysFor(id, env), list = purgeList(kf);
    for (var i = 0; i < list.length; i++) { var k = list[i]; if (k === 'v292Dfix402_f781g_' + id) continue; var s = env.key1 && env.key1.storyOf(k); if ((s ? familyClass(s.family) : 'c') === 'c') return true; }
    return false; }
  function d2Cat(w) { return (w === 'live' || w === 'body-present' || w === 'c-kept') ? w : d1Cat(w); }   /* ★ZT1b r2 */
  /* r2: サーバーの答え。墓標でないと分かった（404・deleted===false・locked）＝その物語は除外して次へ。分からない（401・通信断・欄の欠け）＝全体を止める */
  var D2_SKIP = { 'server-404': 'no-tombstone', 'server-live': 'no-tombstone', 'server-locked': 'vault', 'too-young': 'too-young', 'no-time': 'no-time', 'bad-time': 'no-time' };   /* ★AUTOCLEAN1: 年齢は手動の DISCARD2 では出ない。no-server-time は全体停止 */   /* ★AUTOCLEAN1: 年齢は手動の DISCARD2 では出ない */
  function d2Server(id, r) {
    if (r && r.status === 200 && r.j && r.j.ok === true && String(r.j.id) === String(id) && typeof r.j.deleted !== 'boolean') return { why: 'server-partial' };
    return d1Server(id, r);
  }
  /* ★AUTOCLEAN1（Owner 裁定 2026-11-15 14:40「A」）: 削除から AC_DAYS 日たった物語のスナップショットだけを自動で消す。日数はここ 1 か所 */
  var AC_DAYS = 7, AC_MIN_AGE_MS = AC_DAYS * 24 * 3600 * 1000;
  /* ★AUTOCLEAN1 r6（GPT #127-UV 2）: 日数の分離。
     - 自動の実行（HOME の acTick・b の続き）と、ふつうの手動の run／force は、常に 7 日（AC_DAYS）。端末の鍵 v292DfixAUTOCLEAN1Days はどこにも効かない（r5 の鍵は置きっぱなしでも無害。dry-run と autoclean() で「ignored」と出す）。
     - 手動の dry-run だけ、その 1 回の引数 days で日数を変えて候補を調べられる（autoclean({ dryRun:true, days:1 })。何も消さない）。
     - 7 日以外で実際に消すのは、その 1 回の呼び出しに qaDays と確認の文字列 ack:'QA-DAYS-OWNER-ACK' を両方渡したときだけ（明示的な QA 操作）。片方だけ・形の違う値は何もしない（理由のコードを返す）。
     - qaDays も force も、変えるのは日数（と force の 24 時間の間隔）だけ。Vault・未同期・照合・生きている物語・旧 id・サーバーの墓標と時計の確認は全部そのまま。1 回 3 件・24 時間 18 本も同じ。
     日数の形: 0 以上 30 以下・小数 6 桁まで（0 は 1 ミリ秒として扱い、サーバーの今と墓標の時刻は要る） */
  var AC_DAYS_K = 'v292DfixAUTOCLEAN1Days', AC_DAYS_MAX = 30, AC_QA_ACK = 'QA-DAYS-OWNER-ACK';
  function acDaysParse(raw) {
    if (raw == null) return null; if (typeof raw !== 'string' && typeof raw !== 'number') return null;
    var s = String(raw).replace(/^\s+|\s+$/g, '');
    if (!/^[0-9]{1,2}(\.[0-9]{1,6})?$/.test(s)) return null;                       /* 符号・指数・空・文字 → だめ */
    var d = +s; if (!(isFinite(d) && d >= 0 && d <= AC_DAYS_MAX)) return null;
    return { days: d, ms: Math.max(1, Math.round(d * 24 * 3600 * 1000)) };
  }
  /* 効いている日数は常に 7 日。key = 'ignored'（r5 の鍵が残っている。何にも効かない）／'none' */
  function acDaysGet(get) { var raw = null; try { raw = get(AC_DAYS_K); } catch (e) { raw = null; } return { days: AC_DAYS, ms: AC_MIN_AGE_MS, key: raw == null ? 'none' : 'ignored' }; }
  /* 手動の run の QA 操作。null = 頼まれていない（7 日）／{ err } = 断る（何も書かない）／{ days, ms } */
  function acQaDays(opt) {
    if (!opt || typeof opt !== 'object') return null;
    var hasD = Object.prototype.hasOwnProperty.call(opt, 'qaDays') && opt.qaDays !== undefined, hasA = Object.prototype.hasOwnProperty.call(opt, 'ack') && opt.ack !== undefined;
    if (!hasD && !hasA) return null;
    if (!hasD) return { err: 'qa-days-missing' };
    if (opt.ack !== AC_QA_ACK) return { err: 'qa-ack-mismatch' };
    var p = acDaysParse(opt.qaDays); if (!p) return { err: 'qa-days-invalid' };
    return p;
  }
  function acDaysTxt(d) { return d === 0 ? '削除の後' : '削除から ' + d + ' 日たった後'; }
  /* 端末の墓標の行の削除時刻（serverTombstone.at と deletedAt の新しい方）。無い・読めない → 0 */
  function d2LocalAt(id, env) { var row = zt1Row(String(id), env); if (!row) return 0; var a = 0;
    var st = row.serverTombstone; if (st && typeof st === 'object' && typeof st.at === 'number' && isFinite(st.at) && st.at > 0) a = st.at;
    if (typeof row.deletedAt === 'number' && isFinite(row.deletedAt) && row.deletedAt > a) a = row.deletedAt; return a; }
  /* 年齢の判定（env.d2MinAgeMs があるときだけ）。null = 通過 / 'no-time' / 'too-young' */
  function d2AgeBlock(at, env) { if (!(typeof env.d2MinAgeMs === 'number' && env.d2MinAgeMs > 0)) return null; if (!(typeof at === 'number' && isFinite(at) && at > 0)) return 'no-time'; return (env.now() - at >= env.d2MinAgeMs) ? null : 'too-young'; }
  function d2Survey(env, ctx) {
    var out = { v: 'DISCARD2-r2', at: env.now(), stories: 0, targets: [], snapshots: 0, chars: 0, bodyPresent: { stories: 0, snapshots: 0, chars: 0 },
                excluded: { live: 0, 'body-present': 0, 'too-young': 0, 'no-time': 0, vault: 0, active: 0, unsynced: 0, 'pending-delete': 0, 'no-tombstone': 0, network: 0, legacy: 0, 'unknown-owner': 0 }, unknownOwnerKeys: 0, global: null };
    var gb = globalBlock(env); if (gb) { out.global = gb; return Promise.resolve(out); }
    var ow = d2Owners(env); out.unknownOwnerKeys = ow.unknownKeys; if (ow.unknownKeys) out.excluded['unknown-owner'] += ow.unknownKeys;
    var ids = Object.keys(ow.by).sort(), pend = []; out.stories = ids.length;
    for (var i = 0; i < ids.length; i++) { var w = d2Local(ids[i], env); if (w) { out.excluded[d2Cat(w)] = (out.excluded[d2Cat(w)] || 0) + 1;
        if (w === 'body-present') { var bp = d2Plan(ids[i], env, ow, {}); out.bodyPresent.stories++; out.bodyPresent.snapshots += bp.groups; out.bodyPresent.chars += bp.chars; }   /* 内訳だけ（消さない）。manifest と名前だけを読む */
        continue; }
      var ab = d2AgeBlock(d2LocalAt(ids[i], env), env); if (ab) { out.excluded[ab]++; continue; }   /* ★AUTOCLEAN1（手動の DISCARD2 では d2MinAgeMs が無く、何もしない） */
      pend.push(ids[i]); }
    var chain = Promise.resolve();
    pend.forEach(function (id) { chain = chain.then(function () {
      var pl = d2Plan(id, env, ow, d2Refs(env, ow, id)); if (pl.unknownGroups) out.excluded['unknown-owner'] += pl.unknownKeys;
      if (!pl.keys.length) return;
      return Promise.resolve(ctx.lockHeld(id)).then(function (h) { if (h !== false) { out.excluded.active++; return; }
        out.targets.push({ id: id, groups: pl.groups, keys: pl.keys.length, chars: pl.chars }); out.snapshots += pl.groups; out.chars += pl.chars; }); }); });
    return chain.then(function () { return out; });
  }
  function d2One(id, env, ctx) {
    id = String(id);
    var out = { ok: false, code: null, removed: 0, chars: 0, groups: 0 };
    function fin(c) { out.code = c; return out; }
    var gb = globalBlock(env); if (gb) return Promise.resolve(fin(gb));
    var lb = d2Local(id, env); if (lb) return Promise.resolve(fin(lb));
    var ow = d2Owners(env), pl = d2Plan(id, env, ow, d2Refs(env, ow, id)); if (!pl.keys.length) return Promise.resolve(fin('nothing-left'));
    var seq0 = typeof env.otherTab === 'function' ? env.otherTab(id) : null, tomb0 = tombStr(id, env);
    function race() { if (typeof env.otherTab === 'function' && env.otherTab(id) !== seq0) return 'other-tab-write'; if (tombStr(id, env) !== tomb0) return 'meta-changed'; return null; }
    function replan() { var o2 = d2Owners(env); return d2Plan(id, env, o2, d2Refs(env, o2, id)); }
    return Promise.resolve(ctx.who()).then(function (a0) {
      if (!a0) return fin('no-account');
      return Promise.resolve(ctx.lockHeld(id)).then(function (h) {
        if (h !== false) return fin(h === true ? 'open-in-tab' : 'locks-unavailable');
        return Promise.resolve(ctx.withOpenLock(id, function () {
          return Promise.resolve(ctx.who()).then(function (a1) {
            if (!a1 || a1 !== a0) return fin('principal-changed');
            var gb2 = globalBlock(env) || d2Local(id, env); if (gb2) return fin(gb2);
            var sp2 = samePlan(pl, replan()); if (sp2) return fin(sp2);
            return Promise.resolve(ctx.getStory(id)).then(function (r) {
              var se = d2Server(id, r); if (se.why) return fin(se.why);
              var issuedAt = env.now();
              return Promise.resolve(ctx.who()).then(function (a2) {
                if (!a2 || a2 !== a0) return fin('principal-changed');
                if (typeof env.d2MinAgeMs === 'number' && env.d2MinAgeMs > 0) { var ag = acServerAge(r, ctx, env); if (ag) return fin(ag); }   /* ★AUTOCLEAN1 r2: サーバーの時計だけで年齢を決める */
                return Promise.resolve(ctx.withMatLock(function () {
                  var gb3 = globalBlock(env) || d2Local(id, env); if (gb3) return fin(gb3);
                  var sp3 = samePlan(pl, replan()); if (sp3) return fin(sp3);
                  var rc = race(); if (rc) return fin(rc);
                  var I = env.inv, G = env.gate;
                  if (!I || typeof I.deletePolicy !== 'function' || typeof I.discard2Arm !== 'function' || typeof I.discard2Disarm !== 'function' || typeof I._hash !== 'function') return fin('policy-unavailable');
                  if (!G || typeof G.tryDeleteExact !== 'function') return fin('gate-unavailable');
                  var proof = { v: 1, kind: 'DISCARD2', ack: D1_ACK, acGen: env.acGen === true, runId: 'd2-' + issuedAt + '-' + (++runSeq), storyId: id, accountId: a0, accountIdAfter: a2,
                                serverRev: se.rev, serverDeleted: true, authority: se.authority, issuedAt: issuedAt,
                                keys: pl.keys.map(function (k, j) { return { key: k, bytes: pl.vals[j].length, hash: I._hash(pl.vals[j]), value: pl.vals[j] }; }) };
                  var armed = I.discard2Arm(proof); if (!armed) return fin('arm-refused');
                  try {
                    for (var q = 0; q < pl.keys.length; q++) {
                      var k = pl.keys[q], cur = g(env, k);
                      if (cur == null) continue;
                      if (cur !== pl.vals[q]) return fin('value-changed-mid');
                      var pol = I.deletePolicy({ key: k, value: cur, intent: 'snapshot-discard', discard2Proof: armed });
                      if (!pol || pol.allow !== true || pol.code !== 'snapshot-discard-verified') { out.policyWhy = pol && (pol.discardWhy || pol.code); return fin('policy-refused'); }
                      var b = pol.binding || {};
                      if (b.key !== k || b.bytes !== cur.length || b.hash !== I._hash(cur) || b.storyId !== id || b.runId !== armed.runId) return fin('binding-mismatch');
                      var rr = null; try { rr = G.tryDeleteExact({ key: k, expectedBytes: cur.length, expectedHash: b.hash, intent: 'snapshot-discard', path: 'DISCARD2', reason: 'snapshot-discard' }); } catch (eG) { rr = null; }
                      if (!rr || rr.ok !== true || rr.deleted !== true || g(env, k) != null) { out.gateCode = rr && rr.code; return fin('gate-refused'); }
                      out.removed++; out.chars += k.length + cur.length;
                      if (k.indexOf('__gen_') === 0) { out.genRemoved = (out.genRemoved || 0) + 1; out.genChars = (out.genChars || 0) + k.length + cur.length; }   /* ★GEN1 r4 (c): 数だけ */
                    }
                  } finally { try { I.discard2Disarm(); } catch (eD) {} }
                  out.ok = true; out.groups = pl.groups; return fin('discarded');
                })).then(function (m) { if (!m || m.granted !== true) return fin(m && m.api === false ? 'locks-unavailable' : 'lock-busy'); if (m.threw) return fin('threw'); return m.value; });
              });
            }, function () { return fin('server-unreachable'); });
          });
        })).then(function (x) { if (!x || x.granted !== true) return fin(x && x.api === false ? 'locks-unavailable' : 'open-in-tab'); if (x.threw) return fin(out.code || 'threw'); return x.value; });
      });
    }).then(null, function () { return fin('threw'); });
  }
  function d2Run(opts, env, ctx) {
    var res = { v: 'DISCARD2-r2', ok: false, code: null, stories: 0, snapshots: 0, chars: 0, failed: 0, notProcessed: 0, failedCode: null, ids: [], skipped: {} };
    if (!opts || opts.ack !== D1_ACK) { res.code = 'ack-mismatch'; return Promise.resolve(res); }
    if (g(env, D2_KILL) === '1') { res.code = 'killed'; return Promise.resolve(res); }
    var max = (opts.max == null) ? D1_MAX_DEFAULT : Math.floor(+opts.max);
    if (!(max >= 1)) { res.code = 'bad-max'; return Promise.resolve(res); }
    if (max > D1_MAX_CAP) max = D1_MAX_CAP;
    return d2Survey(env, ctx).then(function (s) {
      if (s.global) { res.code = 'global:' + s.global; return res; }
      var list = s.targets.slice(0, max); res.notProcessed = s.targets.length - list.length; var i = 0;
      function next() {
        if (i >= list.length) { res.ok = true; res.code = list.length ? 'done' : 'nothing-to-do'; return res; }
        var t = list[i++];
        return d2One(t.id, env, ctx).then(function (x) {
          if (x.ok) { res.stories++; res.snapshots += x.groups; res.chars += x.chars; res.ids.push(d1Short(t.id)); return next(); }
          if (D2_SKIP[x.code] && !x.removed) { var sk = D2_SKIP[x.code]; res.skipped[sk] = (res.skipped[sk] || 0) + 1; return next(); }   /* r2: 墓標でないと分かった物語は消さずに数えて次へ */
          res.failed = 1; res.failedCode = x.code; res.chars += x.chars || 0; res.notProcessed += list.length - i; res.code = 'stopped'; if (x.policyWhy) res.policyWhy = String(x.policyWhy); return res;
        });
      }
      return next();
    });
  }
  /* ★AUTOCLEAN1 の 1 回分（自動の入口から呼ぶ。ここだけでは時機を決めない）。記録の鍵に件数と時刻だけ（20 回分）。
     1 日 1 回: 前回の試み（成功・失敗とも）から AC_GAP_MS たっていなければ何もしない。試みる前に記録する（途中で閉じても同じ日にもう一度は動かない）。 */
  var AC_KILL = 'v292DfixAUTOCLEAN1Off', AC_LOGK = 'v292DfixAUTOCLEAN1Log', AC_GAP_MS = 24 * 3600 * 1000, AC_MAX = 3;
  /* ★AUTOCLEAN1 r3（GPT #127-UN）: 既定 OFF。端末の鍵 v292DfixAUTOCLEAN1On='1' の端末だけで動く（アカウント単位ではない）。kill v292DfixAUTOCLEAN1Off='1'（と DISCARD2 の kill）が優先。
     全員 ON に切り替えるときは、この 1 行の AC_DEFAULT_ON を true にする（ほかは変えない）。 */
  var AC_DEFAULT_ON = true, AC_ON = 'v292DfixAUTOCLEAN1On';   /* ★ALLON-B: 全員の既定 ON（kill v292DfixAUTOCLEAN1Off と DISCARD2 の kill が勝つ） */
  function acOnGet(get) { if (get(AC_KILL) === '1' || get(D2_KILL) === '1') return false; return AC_DEFAULT_ON === true || get(AC_ON) === '1'; }
  function acOn(env) { return acOnGet(function (k) { return g(env, k); }); }
  function acLog(env) { var o = J(g(env, AC_LOGK) || 'null', null); return (o && typeof o === 'object' && isArr(o.runs)) ? o : { v: 1, lastTry: 0, runs: [] }; }
  /* r2: 年齢はサーバーの時計だけで決める（getstory の updatedAt＝墓標の時刻 と、直前の /api/auth/me の Date ヘッダ＝サーバーの今）。端末の時計は候補の下見だけ。
     null = 通過 / 'no-server-time'（サーバーの今が分からない＝全体停止）/ 'no-time'（墓標の時刻が無い）/ 'bad-time'（差が負）/ 'too-young' */
  function acServerAge(r, ctx, env) {
    var now = (ctx && typeof ctx.serverNow === 'function') ? ctx.serverNow() : null;
    if (!(typeof now === 'number' && isFinite(now) && now > 0)) return 'no-server-time';
    var at = (r && r.j && typeof r.j.updatedAt === 'number' && isFinite(r.j.updatedAt) && r.j.updatedAt > 0) ? r.j.updatedAt : 0;
    if (!at) return 'no-time';
    var d = now - at; if (d < 0) return 'bad-time';
    return d >= (env.d2MinAgeMs || AC_MIN_AGE_MS) ? null : 'too-young';
  }
  var AC_QMAX = 6, AC_CURK = 'v292DfixAUTOCLEAN1Cur';   /* 1 回の実行で getstory は 6 本まで。候補の回し位置（指紋 8 字だけ） */
  /* ★AUTOCLEAN1 r4: 進みの見直し（既定 OFF・端末の鍵 v292DfixAUTOCLEAN1Pace。'a' = 0 件で終わり残りがある回は 24 時間待たずに次の HOME で続きから（前の試みから 30 分以上）／
     'b' = 消せた回で残りがあれば、同じ HOME で続けてもう 1 回まで／'1' か 'ab' = 両方）。どちらも 24 時間の getstory を AC_DAY_QMAX 本まで（既定の 1 日 1 回は 6 本）。
     a は、進みの無い回が続けて候補を 1 周したら止まり、いつもの 24 時間に戻る。失敗・途中で閉じた回のあとは早めない。AUTOCLEAN1 の kill が優先 */
  var AC_PACE = 'v292DfixAUTOCLEAN1Pace', AC_PACE_DEFAULT = '', AC_DAY_QMAX = 18, AC_PACE_MIN_MS = 30 * 60 * 1000, AC_KEEP_DETAIL = 10;
  function acPace(env) { var v = AC_PACE_DEFAULT || g(env, AC_PACE) || ''; v = String(v); return { a: v === '1' || v === 'ab' || v === 'a', b: v === '1' || v === 'ab' || v === 'b' }; }
  function acDayQ(o, now) { var s = 0; for (var i = 0; i < o.runs.length; i++) { var r = o.runs[i]; if (!r || typeof r.at !== 'number') continue;
      if (r.at > now || now - r.at < AC_GAP_MS) s += (typeof r.q === 'number' && r.q >= 0) ? r.q : AC_QMAX; } return s; }   /* 数が無い古い回は上限の 6 本と数える */
  /* 24 時間たつ前に動いてよいか。null = だめ / 'zero'（a）/ 'chain'（b） */
  function acEarly(o, now, kind, pace) {
    var L = o.runs.length ? o.runs[o.runs.length - 1] : null;
    if (!L || L.at !== o.lastTry || now < o.lastTry) return null;                     /* 最後の試みが記録を書き終えていない（途中で閉じた）・時計が戻った */
    if (L.code !== 'done' || L.failed || L.more !== true) return null;               /* 失敗・止まった回、残りが無い回のあとは早めない */
    if (acDayQ(o, now) + AC_QMAX > AC_DAY_QMAX) return null;                         /* 24 時間の getstory の上限 */
    var prog = ((+L.freed || 0) + (+L.stories || 0)) > 0;
    if (kind === 'chain') return (pace.b && prog && L.chain !== true) ? 'chain' : null;
    if (!pace.a || prog || now - o.lastTry < AC_PACE_MIN_MS) return null;
    var seen = 0; for (var i = o.runs.length - 1; i >= 0; i--) { var r = o.runs[i]; if (!r || r.code !== 'done' || r.failed || ((+r.freed || 0) + (+r.stories || 0)) > 0) break;
      if (typeof r.seen !== 'number') return null; seen += r.seen; }
    if (!(typeof L.aged === 'number') || seen >= L.aged) return null;                 /* 進みの無いまま 1 周した → いつもの 24 時間 */
    return 'zero';
  }
  function acRunOnce(env, ctx, opt) {
    if (!acOn(env)) return Promise.resolve({ code: 'off' });
    var o = acLog(env), now = env.now(), early = null;
    var qa = acQaDays(opt); if (qa && qa.err) return Promise.resolve({ code: qa.err });   /* ★r6: 形の違う QA 操作は何もしない（記録も書かない） */
    var forced = !!(opt && opt.force === true);   /* ★r5: 試験用の 1 回（手動の autoclean({ run:true, force:true }) だけ）。24 時間の間隔は見ないが、24 時間の getstory の上限（AC_DAY_QMAX）は見る */
    if (forced && acDayQ(o, now) + AC_QMAX > AC_DAY_QMAX) return Promise.resolve({ code: 'day-cap' });
    if (!forced && typeof o.lastTry === 'number' && o.lastTry > 0 && now - o.lastTry < AC_GAP_MS && now >= o.lastTry) {
      var pc = acPace(env); if (pc.a || pc.b) early = acEarly(o, now, (opt && opt.chain === true) ? 'chain' : 'zero', pc);   /* ★r4: 鍵が無ければ今までどおり */
      if (!early) return Promise.resolve({ code: 'not-due' }); }
    o.lastTry = now; try { env.ls.setItem(AC_LOGK, JSON.stringify(o)); } catch (eW) { return Promise.resolve({ code: 'log-unwritable' }); }   /* 記録できなければ動かない（毎回動くのを防ぐ） */
    var e2 = {}; for (var k in env) if (Object.prototype.hasOwnProperty.call(env, k)) e2[k] = env[k]; var dd = qa ? qa : { days: AC_DAYS, ms: AC_MIN_AGE_MS }; e2.d2MinAgeMs = dd.ms; e2.only = null; e2.purge = false; e2.acGen = g(env, 'v292DfixGEN1cOn') === '1' && g(env, 'v292DfixGEN1cOff') !== '1';   /* ★GEN1 r4 (c): 専用の On 鍵（既定 OFF）＋ kill。★r5: 日数（鍵が無ければ 7 日） */
    var res = { code: null, freed: 0, freedChars: 0, stories: 0, snapshots: 0, chars: 0, failed: 0, failedCode: null, skipped: {}, queries: 0, why: {}, seen: 0, aged: 0, more: false };   /* ★r4: why・seen・aged・more */
    var c2 = {}; for (var k2 in ctx) if (Object.prototype.hasOwnProperty.call(ctx, k2)) c2[k2] = ctx[k2];
    c2.getStory = function (id) { if (e2.vcSynth && Object.prototype.hasOwnProperty.call(e2.vcSynth, String(id))) return Promise.resolve(JSON.parse(JSON.stringify(e2.vcSynth[String(id)]))); res.queries++; return ctx.getStory(id); };   /* ★VCLEAN1: 確かめた id は通信しない */
    if (vcOnGet(function (kk) { return g(env, kk); })) { e2.vc = true; e2.vcAllow = {}; e2.vcSynth = {}; try { e2.vcUnlocked = typeof env.vcUnlocked === 'function' && env.vcUnlocked() === true; } catch (eU) { e2.vcUnlocked = false; } e2.vcV2 = {}; }   /* ★VCLEAN1 */
    if (e2.vgKill && e2.vgKill.state !== 'none') { res.failed = 1; res.failedCode = 'vaultguard-off-vault2'; res.code = 'stopped'; e2.vc = false; }   /* ★VGUARD2: 何も調べない・何も取り寄せない（VCLEAN1 の一覧の読み取りも休む） */
    if (e2.vg && e2.vg.state === 'unknown') { res.failed = 1; res.failedCode = 'vault2-ids-unknown'; res.code = 'stopped'; }   /* ★VAULTGUARD1: 解錠中なのに隠した id が分からない → 何も調べない（getstory 0） */
    return vcPrep(e2, env, res).then(function () { return acWalk(e2, c2, res); }).then(function () {   /* ★VCLEAN1: 鍵が無ければ何もしない */
      if (!res.code) res.code = res.failed ? 'stopped' : 'done';
      var o2 = acLog(env); var run1 = { at: now, freed: res.freed, freedChars: res.freedChars, stories: res.stories, snapshots: res.snapshots, chars: res.chars, failed: res.failed, code: String(res.code) };
      if (e2.acGen === true) { run1.gens = res.gens || 0; run1.genChars = res.genChars || 0; }   /* ★GEN1 r4 (c): (c) が On のときだけ。数だけ */
      run1.why = acWhyOut(res.why); run1.seen = res.seen; run1.q = res.queries; run1.aged = res.aged; run1.more = res.more === true;   /* ★AUTOCLEAN1 r4: 理由の名前と数・調べた件数・getstory の本数（鍵名・id・本文は入れない） */
      if (early) run1.early = early; if (early === 'chain') run1.chain = true;
      if (qa) { run1.qa = true; run1.days = dd.days; } if (forced) run1.forced = true; if (e2.vc === true) { run1.vc = { unlocked: e2.vcUnlocked === true, listed: res.vq || 0, proven: res.vcProven || 0 }; }   /* ★VCLEAN1: 鍵があるときだけ・数だけ */   /* ★r6: QA 操作の回だけ qa と days（ふつうの回の記録は r4 と同じ） */
      o2.runs.push(run1); while (o2.runs.length > 20) o2.runs.shift();
      for (var ri = 0; ri < o2.runs.length - AC_KEEP_DETAIL; ri++) { var rr = o2.runs[ri]; if (rr && typeof rr === 'object') { delete rr.why; delete rr.seen; delete rr.aged; delete rr.more; delete rr.days; delete rr.daysKey; delete rr.qa; delete rr.vc; } }   /* 内訳は直近 10 回分まで（q は 24 時間の上限の数えに残す） */
      try { env.ls.setItem(AC_LOGK, JSON.stringify(o2)); } catch (eW2) {} return res; }, function () { return { code: 'threw' }; });
  }
  var AC_UNKNOWN = { 'server-unreachable': 1, 'server-not-ok': 1, 'server-authority': 1, 'server-rev': 1, 'server-id-mismatch': 1, 'server-partial': 1, 'no-account': 1, 'principal-changed': 1, 'no-server-time': 1 };
  function acSkip(res, code, stage) { var c = D2_SKIP[code] || code; res.skipped[c] = (res.skipped[c] || 0) + 1; acWhy(res, (stage || 's2') + ':' + c); }
  /* ★AUTOCLEAN1 r4: 断った理由の名前と数（固定の理由コードだけ。形の違う名前は 'other'・名前は 24 種まで） */
  function acWhyName(n) { n = String(n == null ? '' : n); return /^[a-z0-9*][a-z0-9:*_-]{0,47}$/i.test(n) ? n : 'other'; }
  function acWhy(res, name, n) { if (!res || !res.why) return; var k = acWhyName(name); if (!Object.prototype.hasOwnProperty.call(res.why, k) && Object.keys(res.why).length >= 24) k = 'other'; res.why[k] = (res.why[k] || 0) + (n || 1); }
  function acWhyOut(w) { var o = {}, ks = Object.keys(w || {}).sort(); for (var i = 0; i < ks.length; i++) if (typeof w[ks[i]] === 'number' && w[ks[i]] > 0) o[ks[i]] = w[ks[i]]; return o; }
  /* 候補（端末の墓標の行で 7 日以上＝下見）を指紋の順に並べ、前回の続きから（acWalk と dry-run が同じ並びを使う） */
  function acOrder(e2) {
    var aged = candidates(e2).filter(function (id) { return d2AgeBlock(d2LocalAt(id, e2), e2) == null; });
    var fp = function (id) { return d1Short(id); };
    aged.sort(function (a, b) { var x = fp(a), y = fp(b); return x < y ? -1 : (x > y ? 1 : 0); });
    var cur = g(e2, AC_CURK), start = 0;
    if (typeof cur === 'string' && /^[0-9a-f]{8}$/.test(cur)) { for (var i = 0; i < aged.length; i++) if (fp(aged[i]) > cur) { start = i; break; } }   /* 前回の続きから（無ければ先頭から） */
    return { aged: aged, order: aged.slice(start).concat(aged.slice(0, start)) };
  }
  /* 候補（端末の墓標の行で 7 日以上＝下見）を指紋の順に並べ、前回の続きから 1 件ずつ:
       段 1（本体の写しがある）: 通常の FREE2 の判定（survey・その物語だけ）→ 解放できるなら getstory＋/api/auth/me でサーバーの年齢 → freeOne（FREE2 そのもの）
       段 2（本体の写しが無い・スナップショットがある）: d2One（墓標の確認・年齢はサーバーの時計・DISCARD2 の判定と消し方）
     触る物語は 3 まで・getstory は 6 本まで。サーバーの状態が分からない・門の拒否 → 全体停止。墓標でない・年齢が足りない → 数えて次へ。 */
  function acWalk(e2, ctx, res) {
    var K = e2.key1, ow = d2Owners(e2), ao = acOrder(e2), aged = ao.aged;
    var snapIds = {}; for (var sid in ow.by) snapIds[sid] = 1;
    var fp = function (id) { return d1Short(id); };
    var order = ao.order, touched = 0, idx = 0; res.aged = aged.length;
    function mark(id) { try { e2.ls.setItem(AC_CURK, fp(id)); } catch (eC) {} }
    function stop(code) { res.failed = 1; res.failedCode = code; res.code = 'stopped'; }
    function next() {
      if (res.failed || idx >= order.length) return Promise.resolve();
      if (touched >= AC_MAX) { res.more = true; return Promise.resolve(); }   /* ★r4: まだ調べていない候補がある */
      var id = String(order[idx]);
      var hasBody = g(e2, 'chr6_slot_' + id) != null;
      if (res.queries + (hasBody ? 3 : 1) > AC_QMAX) { res.budgetLeft = true; res.more = true; return Promise.resolve(); }   /* 問い合わせの上限: この物語は次の実行で */
      idx++; res.seen = idx; mark(id);
      if (e2.vc === true && vcHidden(id, e2)) {   /* ★VCLEAN1: 隠した物語。解錠していなければ口を呼ばず数えるだけ */
        if (!e2.vcUnlocked) { acWhy(res, 'vc:locked'); return next(); }
        if (!hasBody) { acWhy(res, 'vc:no-body'); return next(); }
        if (!vcMapP) { res.queries++; res.vq = (res.vq || 0) + 1; vcMapP = Promise.resolve(ctx.who()).then(function () { var ids = []; for (var i = 0; i < order.length; i++) if (vcHidden(order[i], e2) && g(e2, 'chr6_slot_' + order[i]) != null) ids.push(String(order[i])); return vcList(e2, ids); }); }
        return vcMapP.then(function (L) {
          if (!L.map) { acWhy(res, 'vc:' + L.why); return next(); }
          return vcCheck(id, L.map[id] || null, e2, ctx).then(function (v) {
            if (!v.ok) { acWhy(res, 'vc:' + v.why); return next(); }
            e2.vcAllow[id] = 1; e2.vcSynth[id] = v.synth; res.vcProven = (res.vcProven || 0) + 1;
            return step1(id, hasBody);
          });
        });
      }
      return step1(id, hasBody);
    }
    var vcMapP = null;
    function step1(id, hasBody) {
      var step = hasBody ? acStage1One(id, e2, ctx, res) : Promise.resolve({ go2: true });
      return step.then(function (x) {
        if (res.failed) return;
        if (x && x.freedNow) touched++;
        if (!(x && x.go2) || g(e2, 'chr6_slot_' + id) != null || (!snapIds[id] && !(e2.acGen === true && g(e2, '__gen_chr6_slot_' + id) != null))) { if (x && x.go2 && !x.freedNow && g(e2, 'chr6_slot_' + id) == null) acWhy(res, 'nothing-held'); return next(); }   /* ★GEN1 r3 (c)／★r4: 本体も控えも無い（墓標の行だけ） */
        if (res.queries + 1 > AC_QMAX) { res.budgetLeft = true; res.more = true; return; }
        var lb = d2Local(id, e2); if (lb) { acSkip(res, d2Cat(lb)); return next(); }
        var o2 = d2Owners(e2), pl = d2Plan(id, e2, o2, d2Refs(e2, o2, id)); if (!pl.keys.length) { acWhy(res, 's2:nothing-left'); return next(); }
        return Promise.resolve(ctx.lockHeld(id)).then(function (h) { if (h !== false) { acSkip(res, 'active'); return next(); }   /* 別のタブで開いている（DISCARD2 の一覧と同じ除外） */
        return d2One(id, e2, ctx).then(function (y) {
          if (y && y.ok) { res.stories++; res.snapshots += y.groups; res.chars += y.chars; if (e2.acGen === true) { res.gens = (res.gens || 0) + (y.genRemoved || 0); res.genChars = (res.genChars || 0) + (y.genChars || 0); } if (!(x && x.freedNow)) touched++; return next(); }
          if (y && D2_SKIP[y.code] && !y.removed) { acSkip(res, y.code); return next(); }
          if (y && y.code === 'nothing-left') { acWhy(res, 's2:nothing-left'); return next(); }
          stop((y && y.code) || 'threw'); if (y && y.policyWhy) res.policyWhy = String(y.policyWhy);
        }); });
      });
    }
    return next();
  }
  /* ★AUTOCLEAN1 r4: dry-run の内訳（サーバーに聞かない・何も書かない）。実行と同じ並び（前回の続きから）で、端末だけで分かる理由を数える。
     need-server:s1 = 段 1 の端末の関門を通った（FREE2 の本文と墓標の照合・サーバーの年齢は実行の時）／need-server:s2 = 段 2 の端末の関門を通った（墓標と年齢は実行の時）。
     next = 次の 1 回で調べる見込み（getstory を段 1 は 3 本・段 2 は 1 本とみた上限の見積もり。実測ではない） */
  function acDryWhy(e2) {
    var out = { why: {}, aged: 0, young: 0, noTime: 0, next: { seen: 0, needServer: 0, q: 0, chars: 0 }, global: null, chars: { s1: 0, s2: 0 } };   /* ★r5: chars = サーバーの確認が全部通ったときの上限の見込み（実測ではない） */
    var all = candidates(e2); for (var i = 0; i < all.length; i++) { var ab = d2AgeBlock(d2LocalAt(all[i], e2), e2); if (ab === 'too-young') out.young++; else if (ab) out.noTime++; }
    var ao = acOrder(e2), ow = d2Owners(e2), snapIds = {}; for (var sid in ow.by) snapIds[sid] = 1; out.aged = ao.aged.length;
    var gb = globalBlock(e2); if (gb) out.global = gb;
    var res = { why: out.why }, q = 0, touch = 0, open = true;
    for (var j = 0; j < ao.order.length; j++) { var id = String(ao.order[j]), body = g(e2, 'chr6_slot_' + id) != null, w = null, cost = 0;
      var ch = 0;
      if (body) { var lb = gb || localBlock(id, e2); if (lb) w = 'f2:' + lb; else { w = 'need-server:s1'; cost = 3; try { ch = planOne(id, e2).chars + d2Plan(id, e2, ow, d2Refs(e2, ow, id)).chars; } catch (eC1) { ch = 0; } out.chars.s1 += ch; } }
      else if (!snapIds[id] && !(e2.acGen === true && g(e2, '__gen_chr6_slot_' + id) != null)) w = 'nothing-held';
      else { var l2 = d2Local(id, e2); if (l2) w = 's2:' + d2Cat(l2); else { var pl = d2Plan(id, e2, ow, d2Refs(e2, ow, id)); if (!pl.keys.length) w = 's2:nothing-left'; else { w = 'need-server:s2'; cost = 1; ch = pl.chars; out.chars.s2 += ch; } } }
      acWhy(res, w);
      if (open) { if (touch >= AC_MAX || q + (body ? 3 : 1) > AC_QMAX) open = false; else { out.next.seen++; if (cost) { out.next.needServer++; q += cost; touch++; out.next.chars += ch; } } }   /* 実行と同じ止め方（段 1 は 3 本・段 2 は 1 本と見積もる） */
    }
    out.next.q = q; out.why = acWhyOut(out.why); return out;
  }
  /* ★VCLEAN1（Owner 2026-11-16 12:30・GPT #127-UX 1 条件付き GO・Owner PC 限定）: Vault で隠したまま削除した物語の端末の写しを、7 日後に消す。
     動くのは、端末の鍵 v292DfixVCLEAN1On='1'（既定 OFF・kill v292DfixVCLEAN1Off='1'）と AUTOCLEAN1 の On があり、HOME の Vault（v2）を解錠しているとき（vault2-ui の status().unlocked）だけ。
     解錠していない・鍵が無い → Vault の口を 1 回も呼ばない（通信 0）。
     確かめ: 既存の fix697 listShadowBasisOnce（listshadow を 1 回・本文は返らない。Vault v2 の解錠中は隠した行も返る）の行で、削除済み・削除から 7 日（updatedAt とサーバーの今。日数は常に 7 日・qaDays は効かない）・
       この端末の全体の hash がサーバーの serverHash と一致（FREE2 と同じ dirtyProof。memoryV1 の有る形・無い形の 2 通り）。題名は hash の入力としてメモリの中だけ。
     通ったら、その id だけ隠し一覧の判定を外し（vcAllow）、ほかの関門（未同期・送信中・開いている・パスコード・旧 id…）は全部そのまま通す。
     getstory は呼ばない（本文を取り寄せない）。段 1・段 2・GEN1c の判定に渡すサーバーの答えは、hash で一致を確かめた端末の内容と一覧の行から組む（vcSynth）。
     記録・dry-run に出すのは件数・字数・理由の名前（vc:*）だけ。id・題名は出さない。 */
  var VC_ON = 'v292DfixVCLEAN1On', VC_OFF = 'v292DfixVCLEAN1Off';
  /* Vault v2 の隠した id（解錠中だけ vault2status が返す hiddenIds・メモリだけ）。解錠中は fix889 の一覧から外れるので、これで隠したものを本文を取り寄せる通常の経路へ流さない。
     解錠していない → 呼ばない。読めない → res に vc:v2-ids-unknown（その実行では VCLEAN1 は何もしない） */
  function vcPrep(e2, env, res) {
    if (!(e2.vc === true && e2.vcUnlocked === true) || typeof env.vcV2Hidden !== 'function') return Promise.resolve();
    res.queries++; res.vq = (res.vq || 0) + 1;
    return Promise.resolve().then(function () { return env.vcV2Hidden(); }).then(function (a) {
      if (!isArr(a)) { e2.vcUnlocked = false; acWhy(res, 'vc:v2-ids-unknown'); return; }
      var o = {}; for (var i = 0; i < a.length; i++) if (a[i] != null) o[String(a[i])] = 1; e2.vcV2 = o; }, function () { e2.vcUnlocked = false; acWhy(res, 'vc:v2-ids-unknown'); });
  }
  function vcOnGet(get) { return get(VC_OFF) !== '1' && get(VC_ON) === '1' && acOnGet(get); }
  function vcHidden(id, env) { if (env.vcAllow && env.vcAllow[String(id)] === 1) return false; return vaultBlock(String(id), env) === 'vault'; }
  /* 一覧の行と端末の写しで確かめる。返り値 { ok, why, synth }（synth は ok のときだけ・メモリだけ） */
  function vcCheck(id, row, env, ctx) {
    function no(w) { return Promise.resolve({ ok: false, why: w }); }
    if (!row) return no('no-row');                                                             /* 解錠が無効・行が無い → 残す */
    if (row.locked) return no('passcode');
    if (row.deleted !== true) return no('live');
    if ((row.authority !== 'shadow' && row.authority !== 'canonical') || typeof row.rev !== 'number' || !(row.rev >= 1) || !HEX64.test(String(row.serverHash || '')) || typeof row.title !== 'string') return no('bad-row');
    var now = (ctx && typeof ctx.serverNow === 'function') ? ctx.serverNow() : null;
    if (!(typeof now === 'number' && isFinite(now) && now > 0)) return no('no-server-time');
    if (!(typeof row.updatedAt === 'number' && isFinite(row.updatedAt) && row.updatedAt > 0)) return no('no-time');
    var d = now - row.updatedAt; if (d < 0) return no('bad-time'); if (d < AC_MIN_AGE_MS) return no('too-young');   /* 常に 7 日 */
    var raw = g(env, 'chr6_slot_' + id); if (raw == null) return no('no-body');                /* 段 2 だけの物語は端末の全体の hash を作れない → 残す */
    var b = J(raw, null); if (!b || typeof b !== 'object' || isArr(b) || !isArr(b.turns)) return no('body-unreadable');
    if (typeof env.dirtyProof !== 'function') return no('hash-unproven');
    var title = row.title, sh = String(row.serverHash);
    return Promise.resolve().then(function () { return env.dirtyProof(id, title, sh, undefined); }).then(function (w0) {
      if (w0 == null) return false;
      return Promise.resolve(env.dirtyProof(id, title, sh, { mem: true })).then(function (w1) { if (w1 == null) return true; throw (w0 === 'content-differs' || w1 === 'content-differs') ? 'hash-mismatch' : 'hash-unproven'; });
    }).then(function (mem) {
      var body = J(raw, null);
      var synth = { status: 200, j: { ok: true, shadow: true, id: id, rev: row.rev, updatedAt: row.updatedAt, deleted: true, authority: row.authority, serverHash: sh, locked: false,
                                      record: { schema: 2, id: id, title: title, deleted: true, body: body, sidecar: mem ? { memoryV1: null } : {} } } };
      return { ok: true, synth: synth, mem: mem };
    }, function (w) { return { ok: false, why: (w === 'hash-mismatch' || w === 'hash-unproven') ? w : 'hash-unproven' }; });
  }
  /* 一覧の口を 1 回（この実行で最初に隠した id に着いたときだけ）。返り値 Promise<{ map } | { why }> */
  function vcList(env, ids) {
    if (typeof env.vcList !== 'function') return Promise.resolve({ why: 'no-port' });
    return new Promise(function (res0) { try { env.vcList(ids, function (rows, err) { if (!rows) return res0({ why: err === 'LOCKED' ? 'locked' : 'list-failed' });
      var m = {}; for (var i = 0; i < rows.length; i++) if (rows[i] && rows[i].id != null) m[String(rows[i].id)] = rows[i]; res0({ map: m }); }); } catch (e) { res0({ why: 'list-failed' }); } });
  }
  function acStage1One(id, e2, ctx, res) {
    var e3 = {}; for (var k in e2) if (Object.prototype.hasOwnProperty.call(e2, k)) e3[k] = e2[k]; e3.only = [id];
    var unknown = null; e3.onReason = function (sid, w) { if (AC_UNKNOWN[String(w)] === 1 && !unknown) unknown = String(w); };
    return survey(e3, ctx).then(function (rep) {
      if (unknown) { res.failed = 1; res.failedCode = unknown; res.code = 'stopped'; return null; }
      if (!rep.eligible.length) { var nr = 0; for (var sk in rep.skipped) if (Object.prototype.hasOwnProperty.call(rep.skipped, sk)) { acWhy(res, 'f2:' + sk, rep.skipped[sk]); nr++; } if (!nr) acWhy(res, 'f2:not-eligible'); return { go2: false }; }   /* FREE2 で解放できない（証明できない・開いている・未同期…）→ 段 1 も段 2 もしない。★r4: FREE2 の理由を数える */
      return Promise.resolve(ctx.getStory(id)).then(function (r) {
        var se = d2Server(id, r);
        if (se.why) { if (D2_SKIP[se.why]) { acSkip(res, se.why, 's1'); return { go2: false }; } res.failed = 1; res.failedCode = se.why; res.code = 'stopped'; return null; }
        return Promise.resolve(ctx.who()).then(function (a) {
          if (!a) { res.failed = 1; res.failedCode = 'no-account'; res.code = 'stopped'; return null; }
          var ag = acServerAge(r, ctx, e2);
          if (ag === 'no-server-time') { res.failed = 1; res.failedCode = ag; res.code = 'stopped'; return null; }
          if (ag) { acSkip(res, ag, 's1'); return { go2: false }; }
          return freeOne(id, e2, ctx).then(function (x) {
            if (x && x.ok) { res.freed++; res.freedChars += x.chars || 0; return { go2: true, freedNow: true }; }
            res.failed = 1; res.failedCode = (x && x.code) || 'threw'; res.code = 'stopped'; return null; });
        });
      }, function () { res.failed = 1; res.failedCode = 'server-unreachable'; res.code = 'stopped'; return null; });
    });
  }
  var api = { version: VERSION, NOTICE: NOTICE, ID_RE: ID_RE, MAX_MULTI: MAX_MULTI, OPEN_LOCK: OPEN_LOCK, MAT_LOCK: MAT_LOCK, keysFor: keysFor, purgeList: purgeList, localBlock: localBlock, candidates: candidates,
              serverEval: serverEval, survey: survey, freeOne: freeOne, freeMany: freeMany, lockCtx: lockCtx, stable: stable,
              writeLog: writeLog, logOfSurvey: logOfSurvey, _memLog: function () { return memLog.slice(); },
              /* ★PURGE1 */ PURGE_ON: PURGE_ON, PURGE_OFF: PURGE_OFF, PURGE_VAULT: PURGE_VAULT, NOTICE_P: NOTICE_P, keysForP: keysForP, purgeListP: purgeListP, localBlockP: localBlockP, planP: planP,
              serverEvalP: serverEvalP, serverEvalMeta: serverEvalMeta, surveyP: surveyP, freeOneP: freeOneP,
              /* ★STUCK1 */ STUCK_OFF: STUCK_OFF, staleDirtyLocal: staleDirtyLocal, stuckNeeds: stuckNeeds, stuckProof: stuckProof,
              /* ★STUCK1 r2 */ STUCK_ON: STUCK_ON, SVERSION: SVERSION, FAMILY_CLASS: FAMILY_CLASS, familyClass: familyClass, /* ★ZT1b */ zt1Extra: zt1Extra, /* ★ZT1b r2 */ cOnlyCount: cOnlyCount, exPost: exPost, EX_OFF: EX_OFF, /* ★EXTRA1 r3 */ ex1Cat: ex1Cat, f2DryTally: f2DryTally, EX1_PROVIDER: EX1_PROVIDER, EX1_MODEL: EX1_MODEL, EX1_ART_MAX: EX1_ART_MAX, /* ★r5 */ ex1Av2: ex1Av2, /* ★r6 */ ex1Sub: ex1Sub, /* ★ZT1c */ zt1Chk: zt1Chk, /* ★r4 */ EX1_READ_MAX: EX1_READ_MAX, exVaultKnown: exVaultKnown, ZT_DIRTY: ZT_DIRTY, ZT_CFG_HASHED: ZT_CFG_HASHED, ZT_CFG_DEFAULT: ZT_CFG_DEFAULT, ZT_TOP: ZT_TOP, provenSubset: provenSubset, raceProbe: raceProbe, raceBlock: raceBlock, planByReason: planByReason, COUNT_ONLY: COUNT_ONLY,
              /* ★AUTOCLEAN1 */ acRunOnce: acRunOnce, AC_DEFAULT_ON: AC_DEFAULT_ON, /* ★r5 */ acDaysGet: acDaysGet, acDaysTxt: acDaysTxt, AC_DAYS_MAX: AC_DAYS_MAX, /* ★r6 */ acDaysParse: acDaysParse, acQaDays: acQaDays, AC_QA_ACK: AC_QA_ACK, /* ★VAULTGUARD1 */ VG_OFF: 'v292DfixVAULTGUARD1Off', /* ★VCLEAN1 */ vcOnGet: vcOnGet, vcCheck: vcCheck, vcHidden: vcHidden, vcDry: vcDry, vaultBlock: vaultBlock, /* ★r4 */ acEarly: acEarly, acPace: acPace, acDayQ: acDayQ, acDryWhy: acDryWhy, acWhyName: acWhyName, AC_DAY_QMAX: AC_DAY_QMAX, AC_PACE_MIN_MS: AC_PACE_MIN_MS, AC_KEEP_DETAIL: AC_KEEP_DETAIL, acOnGet: acOnGet, acServerAge: acServerAge, AC_QMAX: AC_QMAX, AC_DAYS: AC_DAYS, AC_MIN_AGE_MS: AC_MIN_AGE_MS, AC_GAP_MS: AC_GAP_MS, AC_MAX: AC_MAX, d2LocalAt: d2LocalAt,
              /* ★DISCARD2 */ d2Owners: d2Owners, d2Plan: d2Plan, d2Local: d2Local, d2Survey: d2Survey, d2One: d2One, d2Run: d2Run, d2Server: d2Server, D2_SKIP: D2_SKIP,
              /* ★DISCARD1 */ d1Local: d1Local, d1Server: d1Server, d1Survey: d1Survey, d1One: d1One, d1Run: d1Run, d1Cat: d1Cat, D1_ACK: D1_ACK, D1_OVERRIDE: D1_OVERRIDE,
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
  /* ★VCLEAN1 の dry-run の見込み（何も消さない・書かない）。鍵が無い → { on:false }（何も読まない）。解錠していない → 隠した物語の数だけ（口を呼ばない）。
     解錠中 → 一覧の口を 1 回・端末の中で hash を確かめ、通る見込みの件数と字数（本体と控え。GEN1c が On なら世代も）と理由の数。id・題名は出さない */
  function vcDry(e4, cx) {
    if (!vcOnGet(lsg)) return Promise.resolve({ on: false });
    var e5 = {}; for (var k in e4) if (Object.prototype.hasOwnProperty.call(e4, k)) e5[k] = e4[k]; e5.vcAllow = {}; e5.vcV2 = {};
    var unl = false; try { unl = typeof e5.vcUnlocked === 'function' && e5.vcUnlocked() === true; } catch (eU) { unl = false; }
    var pr = { why: {}, queries: 0 }, ee = { vc: true, vcUnlocked: unl };
    return vcPrep(ee, e5, pr).then(function () { e5.vcV2 = ee.vcV2 || {}; unl = ee.vcUnlocked === true; return vcDry2(e5, cx, unl, pr.why); });
  }
  function vcDry2(e5, cx, unl, why0) {
    var ao = acOrder(e5), ids = [], noBody = 0; for (var i = 0; i < ao.order.length; i++) { var id = String(ao.order[i]); if (!vcHidden(id, e5)) continue; if (g(e5, 'chr6_slot_' + id) == null) noBody++; else ids.push(id); }
    var out = { on: true, unlocked: unl, hidden: ids.length + noBody, eligible: 0, chars: 0, why: {} }, rw = { why: out.why };
    for (var w0 in why0) if (Object.prototype.hasOwnProperty.call(why0, w0)) acWhy(rw, w0, why0[w0]);
    if (noBody) acWhy(rw, 'vc:no-body', noBody);
    if (!ids.length) { out.why = acWhyOut(out.why); return Promise.resolve(out); }
    if (!unl) { acWhy(rw, 'vc:locked', ids.length); out.why = acWhyOut(out.why); return Promise.resolve(out); }
    return vcList(e5, ids).then(function (L) {
      if (!L.map) { acWhy(rw, 'vc:' + L.why, ids.length); out.why = acWhyOut(out.why); return out; }
      var ow = d2Owners(e5), chain = Promise.resolve();
      ids.forEach(function (id) { chain = chain.then(function () { return vcCheck(id, L.map[id] || null, e5, cx).then(function (v) {
        if (!v.ok) { acWhy(rw, 'vc:' + v.why); return; }
        var e6 = {}; for (var k6 in e5) if (Object.prototype.hasOwnProperty.call(e5, k6)) e6[k6] = e5[k6]; e6.vcAllow = {}; e6.vcAllow[id] = 1;
        var lb = localBlock(id, e6); if (lb) { acWhy(rw, 'vc-f2:' + lb); return; }
        var ch = 0; try { ch = planOne(id, e6).chars + d2Plan(id, e6, ow, d2Refs(e6, ow, id)).chars; } catch (eC) { ch = 0; }
        out.eligible++; out.chars += ch; acWhy(rw, 'vc:proven');
      }); }); });
      return chain.then(function () { out.why = acWhyOut(out.why); return out; });
    });
  }
  /* ★VAULTGUARD1（既定 ON・kill v292DfixVAULTGUARD1Off='1'）: Vault v2 を解錠している間、fix889 の refresh は隠した物語を fix889 の隠し一覧から外す（ふつうの一覧に出るため）。
     そのままだと AUTOCLEAN1／FREE2／DISCARD1／DISCARD2／GEN1c が、それを隠していない物語として getstory で本文を取り寄せてしまう。
     そこで、入口ごとに vault2status（vault2-ui と同じ op・本文なし・id だけ）を読み、解錠中は v2 の隠した id を Vault 扱いのままにする（理由は f2:vault／s2:vault）。
     解錠中なのに隠した id が分からない（応答の欠け・hiddenComplete=false・読めない）→ その回は全部止める（globalBlock＝vault2-ids-unknown・getstory は 1 本もしない）。
     施錠中・Vault v2 が無い → 何も変えない（施錠中は Worker が隠した物語の getstory を 404 にする）。最後の守り: getstory の直前にもう一度確かめる。
     隠した id はメモリの中だけ（記録・ログには書かない。数だけ status().vaultGuard に出す）。VCLEAN1 の本文なしの照合（vcAllow）はこれより先に通る */
  /* ★VGUARD2（GPT #127-VN 2・案 b）: kill（v292DfixVAULTGUARD1Off='1'）は「Vault v2 の隠した id を照合から外す守り」を止めるだけで、
     従来の「解錠中は隠した削除済み物語の本文を getstory で取り寄せうる」動きには戻さない。kill の端末では、入口ごとに読む vault2status
     （EXTRA1 r4 の exvSnap・本文なし）が Vault v2 なし（none）と確かめられたときだけ今までどおり動き、それ以外（locked・unlocked・unknown・古い）は
     globalBlock＝'vaultguard-off-vault2' で FREE2・AUTOCLEAN1（GEN1c・VCLEAN1 を含む）・DISCARD1/2・STUCK1・PURGE1 の照合を休む。
     最後の守り: kill の端末でも getstory の直前に vault2status を読み直し、none でなければ取り寄せない（status().vaultGuard.killBlocked）。kill なしは何も変えない。 */
  var VG_OFF = 'v292DfixVAULTGUARD1Off', VG_TTL_MS = 15000, VG = { state: 'none', ids: null, n: 0, at: 0, ui: null }, vgInflight = null;
  function vgOn() { return lsg(VG_OFF) !== '1'; }
  function vgUi() { try { var U = root.__v292Dvault2Ui, s = (U && typeof U.status === 'function') ? U.status() : null; return s ? { hasVault: s.hasVault === true, unlocked: s.unlocked === true, count: (typeof s.hiddenCount === 'number') ? s.hiddenCount : null } : null; } catch (e) { return null; } }
  function vgUiHasVault() { try { var U = root.__v292Dvault2Ui, s = (U && typeof U.status === 'function') ? U.status() : null; return !!(s && s.hasVault === true); } catch (e) { return true; } }   /* r1 と同じ */
  function vgUiKey(u) { return u ? (u.unlocked ? 'u' : 'l') + ':' + (u.count == null ? '-' : u.count) : null; }
  /* vault2status を 1 回読む（本文なし・id だけ）。返り値 { state, ids, n }。r2: unlocked が真偽値でない応答は unknown */
  function vgFetch() {
    function mk(state, ids) { var o = null, n = 0; if (ids) { o = {}; for (var i = 0; i < ids.length; i++) if (ids[i] != null) { o[String(ids[i])] = 1; n++; } } return { state: state, ids: o, n: n }; }
    return Promise.resolve().then(function () {
      return root.fetch('/api/save', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'x-chronicle-csrf': '1' }, body: JSON.stringify({ op: 'vault2status' }) });
    }).then(function (r) { return r && r.ok ? r.json() : null; }).then(function (j) {
      if (!j || j.ok !== true) return mk(vgUiHasVault() ? 'unknown' : 'none', null);   /* 読めない: Vault v2 を使っている端末なら止める（使っていなければ隠したものは無い） */
      if (typeof j.unlocked !== 'boolean') return mk('unknown', null);                 /* r2: 欄が欠けている・真偽値でない → 証明できない */
      if (j.unlocked !== true) return mk(j.hasVault === true ? 'locked' : 'none', null);
      if (!isArr(j.hiddenIds) || j.hiddenComplete === false) return mk('unknown', null);
      return mk('unlocked', j.hiddenIds);
    }, function () { return mk(vgUiHasVault() ? 'unknown' : 'none', null); });
  }
  /* 入口の判定（シート・dry-run・実行の前）。使い回すのは、15 秒以内で、しかも vault2-ui の status() の unlocked と hiddenCount が覚えた時と同じときだけ（r2） */
  function vgRefresh() {
    if (!vgOn()) return Promise.resolve(VG);
    if (vgInflight) return vgInflight;
    var u0 = vgUi(), k0 = vgUiKey(u0);
    if (VG.at && Date.now() - VG.at < VG_TTL_MS && Date.now() >= VG.at && k0 != null && VG.ui === k0) return Promise.resolve(VG);
    vgInflight = vgFetch().then(function (x) { VG = { state: x.state, ids: x.ids, n: x.n, at: Date.now(), ui: vgUiKey(vgUi()) }; vgInflight = null; return VG; });
    return vgInflight;
  }
  function vgSnap() { return vgOn() ? { state: VG.state, ids: VG.ids } : null; }
  /* ★EXTRA1 r4: VAULTGUARD1 の kill に関係なく、入口ごとに vault2status を読む（本文なし・id だけ）。使い回しは VAULTGUARD1 と同じ条件（15 秒・vault2-ui の状態が同じ） */
  var EXV = { state: 'unknown', ids: null, at: 0, ui: null }, exvInflight = null;
  function exvFresh() { var k0 = vgUiKey(vgUi()); return !!(EXV.at && Date.now() - EXV.at < VG_TTL_MS && Date.now() >= EXV.at && EXV.ui === k0); }
  function exvRefresh() { if (exvInflight) return exvInflight; if (exvFresh()) return Promise.resolve(EXV);
    exvInflight = vgFetch().then(function (x) { EXV = { state: x.state, ids: x.ids, at: Date.now(), ui: vgUiKey(vgUi()) }; exvInflight = null; return EXV; },
                                 function () { EXV = { state: 'unknown', ids: null, at: Date.now(), ui: null }; exvInflight = null; return EXV; });
    return exvInflight; }
  function exvSnap() { return exvFresh() ? { state: EXV.state, ids: EXV.ids } : { state: 'unknown', ids: null }; }   /* 古い・未取得 → 分からない */
  function vgThen(f) { return Promise.all([vgRefresh(), exvRefresh()]).then(function () { return f(); }, function () { return f(); }); }   /* ★r4: exvRefresh も */
  function ex1ModelOkB(v) { try { var R = root.__CHR_MODEL_REGISTRY; if (!R || typeof v !== 'string' || !v) return false;   /* ★EXTRA1 r3: HOME のモデル一覧が認める名前だけ（一覧が無ければ許さない） */
      if (typeof R.primary === 'function' && v === R.primary()) return true; if (typeof R.secondary === 'function' && v === R.secondary()) return true;
      if (typeof R.isLegacyPrimary === 'function' && R.isLegacyPrimary(v) === true) return true; return typeof R.isManaged === 'function' && R.isManaged(v) === true; } catch (e) { return false; } }
  function zt1ModelsB() { try { var R = root.__CHR_MODEL_REGISTRY, p = (R && typeof R.primary === 'function') ? R.primary() : ''; return (typeof p === 'string' && p) ? [p] : []; } catch (e) { return []; } }   /* ★ZT1b: 読むのは HOME のモデル一覧だけ（localStorage は読まない） */
  function benv() {
    var K = null; try { K = root.__v292DfixKEY1; K = (K && typeof K.enabled === 'function' && K.enabled()) ? K : null; } catch (e) { K = null; }
    var pOn = lsg(PURGE_ON) === '1' && lsg(PURGE_OFF) !== '1';
    return { ls: root.localStorage, ss: root.sessionStorage, now: function () { return Date.now(); }, key1: K, multi: lsg(MULTI_OFF) !== '1', vg: vgSnap(), vgKill: vgOn() ? undefined : { state: exvSnap().state },   /* ★VAULTGUARD1 ／ ★VGUARD2: kill のときだけ */
             purge: pOn, purgeVault: pOn && lsg(PURGE_VAULT) === '1',
             stuck1: lsg(STUCK_ON) === '1' && lsg(STUCK_OFF) !== '1', dirtyProof: dirtyProofB, otherTab: otherTabSeq,   /* ★STUCK1 r2: 既定 OFF */
             zt1: lsg(ZT_OFF) !== '1',   /* ★ALLON-B: ZT1 は全員の既定 ON（kill v292DfixZT1Off が勝つ。ZT1b〔zt1Dirty〕は今のまま ZT1On と ZT1Dirty の鍵が要る） */   /* ★ZT1: 既定 OFF */
             extra1: lsg(EX_OFF) !== '1', ex1ModelOk: ex1ModelOkB, ex1Vault: exvSnap(), ex1Ctr: { left: EX1_READ_MAX },   /* ★r4 */   /* ★EXTRA1: 既定 ON（r3: モデル名の確かめ） */
             zt1Dirty: lsg(ZT_ON) === '1' && lsg(ZT_OFF) !== '1' && lsg(ZT_DIRTY) === '1', zt1Models: zt1ModelsB(),   /* ★ZT1b（ZT1 OFF のときは ZT_DIRTY を読まない） */
             free2: lsg(F2_OFF) !== '1',   /* ★FREE2c: 既定 ON（kill v292DfixFREE2Off='1'）。v292DfixFREE2On は読まない */
             free2d: lsg('v292DfixFREE2dOff') !== '1',   /* ★FREE2d（kill v292DfixFREE2dOff='1' → FREE2c と同じ） */
             saveBusy: saveBusyB,   /* ★FREE2c: この画面の fix697 がその物語の保存を送っている最中か（FREE2 のときだけ呼ぶ） */
             vu: (function () { try { var U = root.__v292DfixVAULTUNI1; return (U && U.on()) ? function (id) { return U.del(id, 'store1b'); } : null; } catch (e) { return null; } })(),   /* ★VAULTUNI1 */
             vault: root.__v292Dfix889 || null, inv: root.__v292Dfix562 || null, gate: root.__v292Dfix569 || null,
             vcUnlocked: function () { try { var U = root.__v292Dvault2Ui, s = (U && typeof U.status === 'function') ? U.status() : null; return !!(s && s.hasVault === true && s.unlocked === true); } catch (e) { return false; } },   /* ★VCLEAN1: HOME の Vault（v2）を開いている。v1（fix889）の解錠は本番の Worker で休止中（VAULT_V1_DORMANT）なので使わない */
             vcV2Hidden: function () { try { return root.fetch('/api/save', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'x-chronicle-csrf': '1' }, body: JSON.stringify({ op: 'vault2status' }) })
               .then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { return (j && j.ok === true && j.unlocked === true && isArr(j.hiddenIds) && j.hiddenComplete !== false) ? j.hiddenIds.map(String) : null; }, function () { return null; }); } catch (e) { return Promise.resolve(null); } },   /* ★VCLEAN1: 解錠中だけ呼ぶ（vault2-ui と同じ op・同じ cookie） */
             vcList: function (ids, cb) { try { var U = root.__v292Dvault2Ui, s = (U && typeof U.status === 'function') ? U.status() : null; if (!(s && s.hasVault === true && s.unlocked === true)) return cb(null, 'LOCKED');
               var W = root.__v292Dfix697; if (!W || typeof W.listShadowBasisOnce !== 'function') return cb(null, 'NO_PORT'); var want = {}; for (var i = 0; i < ids.length; i++) want[String(ids[i])] = 1;
               W.listShadowBasisOnce(function (rows, err) { if (!rows) return cb(null, err || 'LIST_FAIL'); var out = []; for (var j = 0; j < rows.length; j++) { var x = rows[j]; if (!x || want[String(x.id)] !== 1) continue;
                 out.push({ id: String(x.id), deleted: x.deleted === true, updatedAt: x.updatedAt, serverHash: x.serverHash, rev: x.rev, authority: x.authority, locked: !!x.locked, title: x.title }); } cb(out, null); }); } catch (e) { cb(null, 'THREW'); } },   /* 既存の口（listshadow・本文なし）。解錠中は Vault v2 の cookie で隠した行も返る。頼んだ id の行だけを渡す */
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
  var srvClock = null; function perfNow() { try { return root.performance.now(); } catch (e) { return 0; } }
  function bctx() {
    var L = null; try { L = root.navigator && root.navigator.locks; } catch (e) { L = null; }
    var lc = lockCtx(L);
    return {
      who: function () {
        return root.fetch('/api/auth/me', { method: 'GET', credentials: 'same-origin', cache: 'no-store', headers: { 'x-chronicle-csrf': '1' } })
          .then(function (r) { try { var dh = r.headers && r.headers.get('Date'), dm = dh ? Date.parse(dh) : NaN; srvClock = (isFinite(dm) && dm > 0) ? { t: dm, p: perfNow() } : null; } catch (eD) { srvClock = null; }   /* ★AUTOCLEAN1 r2: サーバーの今 */
            return r.ok ? r.json() : null; }, function () { srvClock = null; return null; })
          .then(function (j) { return (j && j.ok === true && j.accountId) ? String(j.accountId) : null; }, function () { return null; });
      },
      getStory: function (id) { return vgFetch().then(function (G) { if (!vgOn() && (!G || G.state !== 'none')) { st.vgKillBlocked = (st.vgKillBlocked || 0) + 1; return null; }   /* ★VGUARD2: kill の端末でも、Vault v2 なしと確かめられなければ取り寄せない */   /* ★VAULTGUARD1: 最後の守り（本文を取り寄せる前）。r2: 使い回さず毎回読み直す */
        if (G && G.state === 'unknown') { st.vgBlocked = (st.vgBlocked || 0) + 1; return null; }
        if (G && G.state === 'unlocked' && G.ids && G.ids[String(id)] === 1) { st.vgBlocked = (st.vgBlocked || 0) + 1; return { status: 404, j: { ok: false } }; }
        return new Promise(function (res) { var W = root.__v292Dfix697; if (!W || typeof W.getStoryV2Once !== 'function') return res(null);
        try { W.getStoryV2Once(id, function (x, err) { res(err ? null : x); }); } catch (e) { res(null); } }); }); },
      /* ★PURGE1: 隠した物語の削除済みの確認は、本文を含まない一覧の行（listshadow）だけで行う */
      serverMeta: function (id) { return new Promise(function (res) { var W = root.__v292Dfix697; if (!W || typeof W.listShadowBasisOnce !== 'function') return res(null);
        try { W.listShadowBasisOnce(function (rows, err, status) { if (!rows) return res({ status: status || 0 }); var hit = null; for (var i = 0; i < rows.length; i++) if (rows[i] && String(rows[i].id) === String(id)) { hit = rows[i]; break; } res({ status: 200, row: hit }); }); } catch (e) { res(null); } }); },
      serverNow: function () { return srvClock ? srvClock.t + Math.max(0, perfNow() - srvClock.p) : null; },   /* ★AUTOCLEAN1 r2: 直前の /api/auth/me の Date ＋ そこからの経過（単調な時計） */
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
                   : ('<p id="s1btotal">消せる物語 ' + t.stories + ' 件・合計 ' + esc(kchars(t.chars)) + '（スナップショット ' + t.snapshotsKept + ' 件は' + (!acOnGet(lsg) ? '残します' : '、削除から ' + AC_DAYS + ' 日たつと自動で消えます') + '）</p>');   /* ★AUTOCLEAN1 */
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
    var e = null;
    return vgThen(function () { e = benv(); return (e.purge ? freeOneP : freeOne)(id, e, bctx()); }).then(function (x) {   /* ★VAULTGUARD1 */
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
    var e = null;
    return vgThen(function () { e = benv(); return freeMany(ids, e, bctx(), function (i, n) { if (M === mine) { M.step = [i, n]; render(); } }); }).then(function (x) {   /* ★VAULTGUARD1 */
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
    M = { phase: 'loading', msg: msg || '確認しています…', rep: null, picks: [], multi: lsg(MULTI_OFF) !== '1', result: result || null, step: null, purge: be0.purge === true, stuck1: be0.stuck1 === true };
    render();
    if (!ready()) { M.phase = 'done'; M.msg = 'いまはこの操作を使えません。物語はそのまま残っています。'; render(); return Promise.resolve(false); }
    var mine = M;
    return vgThen(function () { var be1 = benv(); return (be1.purge ? surveyP : survey)(be1, bctx()); }).then(function (rep) {   /* ★VAULTGUARD1 */
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
  function dryRun() { return vgThen(dryRun0); }   /* ★VAULTGUARD1 */
  function dryRun0() {
    var e = benv();
    if (!ready()) { var r0 = { at: Date.now(), v: VERSION, kind: 'dry', notReady: true }; writeLog(e, r0); st.dry = r0; return Promise.resolve(r0); }
    return (e.purge ? surveyP : survey)(e, bctx()).then(function (rep) { var L = logOfSurvey(rep, 'dry'); L.logWritten = writeLog(e, L); st.dry = L; return L; });
  }
  root.__v292DfixSTORE1b = {
    version: VERSION,
    open: function () { return openFlow(); },
    multi: function () { return lsg(MULTI_OFF) !== '1'; },
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
    /* ★DISCARD1（手動専用・UI なし・自動では呼ばれない）。dryRun は読むだけ（消さない・書かない・記録も書かない）。 */
    /* ★DISCARD2（手動専用・UI なし・自動では呼ばれない）。dryRun は名前と manifest だけ（通信なし・何も書かない）。 */
    discard2DryRun: function () { if (lsg(D2_KILL) === '1') return Promise.resolve({ killed: true }); if (!ready()) return Promise.resolve({ notReady: true });
      return d2Survey(benv(), bctx()).then(function (o) { return { v: o.v, stories: o.stories, targets: o.targets.length, snapshots: o.snapshots, chars: o.chars, bodyPresent: o.bodyPresent, excluded: o.excluded, unknownOwnerKeys: o.unknownOwnerKeys, global: o.global, ids: o.targets.map(function (t) { return d1Short(t.id); }) }; }); },
    discard2Run: function (opts) { if (!opts || opts.ack !== D1_ACK) return Promise.resolve({ code: 'ack-mismatch', stories: 0 }); if (!ready()) return Promise.resolve({ notReady: true, stories: 0 });
      var e = benv(); return d2Run(opts, e, bctx()).then(function (r) {
        try { var o = J(lsg(D2_LOGK) || 'null', null); if (!o || !isArr(o.runs)) o = { v: 1, runs: [] }; o.runs.push({ at: Date.now(), stories: r.stories, snapshots: r.snapshots, chars: r.chars, failed: r.failed, code: r.code }); while (o.runs.length > 20) o.runs.shift(); root.localStorage.setItem(D2_LOGK, JSON.stringify(o)); r.logWritten = true; } catch (eL) { r.logWritten = false; }
        return r; }); },
    discard1DryRun: function () { if (lsg(D1_KILL) === '1') return Promise.resolve({ killed: true }); if (!ready()) return Promise.resolve({ notReady: true });
      return d1Survey(benv(), bctx()).then(function (o) { return { v: o.v, candidates: o.candidates, targets: o.targets.length, chars: o.chars, excluded: o.excluded, global: o.global, ids: o.targets.map(function (t) { return d1Short(t.id); }) }; }); },
    discard1Run: function (opts) { if (!opts || opts.ack !== D1_ACK) return Promise.resolve({ code: 'ack-mismatch', freed: 0 }); if (!ready()) return Promise.resolve({ notReady: true, freed: 0 });
      var e = benv(); return d1Run(opts, e, bctx()).then(function (r) {
        try { var o = J(lsg(D1_LOGK) || 'null', null); if (!o || !isArr(o.runs)) o = { v: 1, runs: [] }; o.runs.push({ at: Date.now(), freed: r.freed, chars: r.chars, failed: r.failed, code: r.code }); while (o.runs.length > 20) o.runs.shift(); root.localStorage.setItem(D1_LOGK, JSON.stringify(o)); r.logWritten = true; } catch (eL) { r.logWritten = false; }
        return r; }); },
    free2DryRun: function () {   /* ★EXTRA1 r3: 中身は f2DryTally（r2 の数に proofExtra を足した・読むだけ） */
      var e = benv();
      if (!ready()) return Promise.resolve({ v: F2_VERSION, on: e.free2 === true, notReady: true });
      return f2DryTally(e, bctx());
    },
    /* ★AUTOCLEAN1: autoclean() = 状態（読むだけ）／autoclean({ dryRun:true }) = 何も消さず・記録も書かず（1 日 1 回に数えない）候補の数・7 日以上の数（端末の下見）・サーバーの今が読めたか／
       autoclean({ run:true }) = 自動と同じ 1 回の実行（On の端末だけ・1 日 1 回の制限も同じ） */
    autoclean: function (opt) {
      if (opt && opt.dryRun === true) { if (!ready()) return Promise.resolve({ notReady: true }); var e = benv(), cx = bctx();
        var dk = acDaysGet(lsg), dArg = (Object.prototype.hasOwnProperty.call(opt, 'days') && opt.days !== undefined) ? acDaysParse(opt.days) : null;   /* ★r6: 日数は引数 days だけ（鍵は効かない） */
        var dd = dArg ? dArg : { days: AC_DAYS, ms: AC_MIN_AGE_MS }, dSrc = (opt.days === undefined) ? 'none' : (dArg ? 'set' : 'invalid');
        var c = candidates(e), aged = c.filter(function (id) { return d2AgeBlock(d2LocalAt(id, e), { d2MinAgeMs: dd.ms, now: e.now }) == null; });
        var lg = acLog(e), due = !(typeof lg.lastTry === 'number' && lg.lastTry > 0 && e.now() - lg.lastTry < AC_GAP_MS && e.now() >= lg.lastTry);
        var gOn = lsg('v292DfixGEN1cOn') === '1' && lsg('v292DfixGEN1cOff') !== '1', gN = 0, gC = 0;   /* ★GEN1 r4 (c): 見込み（端末の下見だけ。サーバーの墓標と年齢は実行の時に確かめる） */
        if (gOn) aged.forEach(function (id) { if (g(e, 'chr6_slot_' + id) != null) return; var gk = '__gen_chr6_slot_' + id, gv = g(e, gk); if (gv == null) return; var e3 = {}; for (var kk in e) if (Object.prototype.hasOwnProperty.call(e, kk)) e3[kk] = e[kk]; if (d2Local(id, e3)) return; if (!acGenOK(id, e3, gv)) return; gN++; gC += gk.length + gv.length; });
        var e4 = {}; for (var k4 in e) if (Object.prototype.hasOwnProperty.call(e, k4)) e4[k4] = e[k4]; e4.d2MinAgeMs = dd.ms; e4.only = null; e4.purge = false; e4.acGen = gOn;   /* ★AUTOCLEAN1 r4: 実行と同じ env の形 */
        var dw = null; try { dw = acDryWhy(e4); } catch (eDW) { dw = { failed: true }; }
        var pc = acPace(e), early = null; if (!due && (pc.a || pc.b)) early = acEarly(lg, e.now(), 'zero', pc);
        return Promise.resolve(cx.who()).then(function (a) { return vcDry(e4, cx).then(function (vcd) { var n = cx.serverNow(); var co = null; try { co = cOnlyCount(e4); } catch (eCO) { co = null; } return { code: 'dry', cOnly: co, vclean: vcd, on: acOnGet(lsg), account: !!a, serverTime: typeof n === 'number' && n > 0, candidates: c.length, aged: aged.length, due: due, days: dd.days, daysArg: dSrc, daysKey: dk.key, autoDays: AC_DAYS, gen: { on: gOn, candidates: gN, chars: gC },
          breakdown: dw, pace: { a: pc.a, b: pc.b, early: early, dayQ: acDayQ(lg, e.now()), dayCap: (pc.a || pc.b) ? AC_DAY_QMAX : AC_QMAX } }; }); }); }
      if (opt && opt.run === true) { if (!acOnGet(lsg)) return Promise.resolve({ code: 'off' }); if (!ready()) return Promise.resolve({ notReady: true });
        var ro = { force: opt.force === true }; if (opt.qaDays !== undefined) ro.qaDays = opt.qaDays; if (opt.ack !== undefined) ro.ack = opt.ack;   /* ★r6: QA 操作はその 1 回の引数だけ */
        return acRunOnce(benv(), bctx(), ro).then(function (r) { st.autoclean = { code: r.code, freed: r.freed || 0, stories: r.stories || 0, snapshots: r.snapshots || 0, failed: r.failed || 0, manual: true, gens: r.gens || 0, genChars: r.genChars || 0 }; return r; }); }
      var ds = acDaysGet(lsg); return { days: AC_DAYS, daysKey: ds.key, on: acOnGet(lsg), defaultOn: AC_DEFAULT_ON, last: st.autoclean, log: J(lsg(AC_LOGK) || 'null', null) }; },
    status: function () { return JSON.parse(JSON.stringify({ version: VERSION, vaultGuard: { on: vgOn(), state: VG.state, hidden: VG.n, blocked: st.vgBlocked || 0, killBlocked: st.vgKillBlocked || 0 }, stuck1: { v: SVERSION, on: benv().stuck1 === true }, ready: ready(), opened: st.opened, surveys: st.surveys, freed: st.freed, last: st.last, lastSurvey: st.lastSurvey, dry: st.dry, memLog: memLog })); }
  };
  (function () {   /* ★VAULTGUARD1: 判定と実行の入口は、先に Vault v2 の隠した id を読む */
    var A = root.__v292DfixSTORE1b; ['explain', 'planByReason', 'discard2DryRun', 'discard2Run', 'discard1DryRun', 'discard1Run', 'free2DryRun'].forEach(function (k) {
      var f = A[k]; if (typeof f !== 'function') return; A[k] = function () { var a = arguments, s = this; return vgThen(function () { return f.apply(s, a); }); }; });
    var ac = A.autoclean; A.autoclean = function (opt) { if (opt && (opt.dryRun === true || opt.run === true)) { var s = this; return vgThen(function () { return ac.call(s, opt); }); } return ac.call(this, opt); };
  })();
  function boot() {
    decorate();
    try { var mo = new root.MutationObserver(function () { if (!root.document.getElementById('s1bBtn')) decorate(); }); mo.observe(root.document.body, { childList: true, subtree: true }); } catch (e) {}
    if (lsg(DRY) === '1') root.setTimeout(function () { dryRun(); }, 6000);
    acSchedule();
  }
  /* ★AUTOCLEAN1 の自動の入口（HOME だけ: この部品は home.html だけが読む。念のため ?story= の画面でも動かない）。
     読み込みから AC_DELAY_MS 後、アイドルのときに 1 回だけ試す。条件が合わなければ少し待って最大 AC_TRIES 回まで見直す。画面には何も出さない。 */
  var AC_DELAY_MS = 30000, AC_TRIES = 6, AC_RETRY_MS = 20000, acTries = 0, acDone = false;
  st.autoclean = null;
  function acIdle() {
    try { if (root.document.hidden) return false; } catch (e) {}
    try { if (root.navigator && root.navigator.onLine === false) return false; } catch (e) {}
    if (M) return false;                                                                         /* 空き容量のシートを開いている */
    try { if (root.document.getElementById('dl2sheet')) return false; } catch (e) {}              /* 削除のシートを開いている */
    try { var W = root.__v292Dfix697; if (W && typeof W.status === 'function') { var s2 = W.status(); if (s2 && s2.inFlight) return false; } } catch (e) { return false; }   /* 保存を送っている */
    return true;
  }
  function acTick() {
    if (acDone) return;
    if (!acOnGet(lsg)) { acDone = true; st.autoclean = { code: 'off' }; return; }
    try { if (/[?&]story=/.test(String(root.location.search || ''))) { acDone = true; return; } } catch (e) {}
    if (!ready() || !acIdle()) { if (++acTries < AC_TRIES) root.setTimeout(acTick, AC_RETRY_MS); else st.autoclean = { code: 'not-idle' }; return; }
    acDone = true;
    var go = function () { vgThen(function () { return acRunOnce(benv(), bctx()); }).then(function (r) { st.autoclean = { code: r.code, freed: r.freed || 0, stories: r.stories || 0, snapshots: r.snapshots || 0, failed: r.failed || 0, gens: r.gens || 0, genChars: r.genChars || 0 }; acChain(r); try { var U = root.__v292DfixVAULTUNI1; if (U && U.on()) U.hold('store1b', function () { if (acOnGet(lsg) && ready() && acIdle()) { st.vuRerun = (st.vuRerun || 0) + 1; go(); } }); } catch (eH) {} }, function () { st.autoclean = { code: 'threw' }; }); };   /* ★VAULTUNI1: 分からなかった物語は、判定が取れてから入口（acRunOnce の全部の確かめ）をやり直す */
    try { if (typeof root.requestIdleCallback === 'function') root.requestIdleCallback(go, { timeout: 10000 }); else go(); } catch (e) { go(); }
  }
  /* ★AUTOCLEAN1 r4 (b): 鍵 'b' のときだけ。消せて残りがある回のあと、同じ HOME で 1 回だけ続ける（記録の chain で 2 回目は無い。24 時間の上限も acEarly が見る） */
  function acChain(r) {
    if (!r || r.code !== 'done' || r.failed || r.more !== true || ((r.freed || 0) + (r.stories || 0)) < 1) return;
    var pc = acPace(benv()); if (!pc.b || !acOnGet(lsg)) return;
    root.setTimeout(function () { if (!acOnGet(lsg) || !ready() || !acIdle()) return;
      vgThen(function () { return acRunOnce(benv(), bctx(), { chain: true }); }).then(function (r2) { if (r2 && r2.code !== 'not-due') st.autoclean = { code: r2.code, freed: r2.freed || 0, stories: r2.stories || 0, snapshots: r2.snapshots || 0, failed: r2.failed || 0, gens: r2.gens || 0, genChars: r2.genChars || 0, chain: true }; }, function () {}); }, 5000);
  }
  function acSchedule() { if (!acOnGet(lsg)) return;   /* r3: OFF の端末では timer も置かない（土台と同じ） */ root.setTimeout(acTick, (+lsg('v292DfixAUTOCLEAN1DelayMs') > 0 ? +lsg('v292DfixAUTOCLEAN1DelayMs') : AC_DELAY_MS)); }
  if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', function () { root.setTimeout(boot, 1500); }); else root.setTimeout(boot, 1500);
})(typeof window !== 'undefined' ? window : null);
