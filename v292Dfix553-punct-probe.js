/* v292Dfix553-punct-probe.js (2026-07-25) — 句読点崩れの発生段階を突き止める「読み取り専用」検出器
 *
 * ■何を直すためのものか(まだ直さない)
 *   2026-07-25のA/B試験(54ターン)で、**句読点が完全に落ちた長文**が約7%のターンで出た。
 *   実セーブ205ターンでも4ターンで再現。最悪例は262字にわたって「、」も「。」も無い。
 *   プレイヤーが直接読む文章なので実害がある。
 *
 * ■すでに実データで分かっていること(2026-07-25)
 *   ・保存本文 と plan.narrative(パース段の掃除まで通した状態) を205ターンで突き合わせた結果、
 *     **保存側だけが崩れている例は0件・plan側だけ崩れている例も0件**。
 *     → 後段の後処理(fix53/300/439/467 など)が壊しているのでも、直しているのでもない。
 *   ・崩れは1ターンの**後半に偏る**(実例: 18要素中 0〜13は正常、14/15/17だけ句読点ゼロ)。
 *   → 残る容疑は「モデルの生出力」か「パース段の掃除」の2つ。**生出力は保存されていない**ので測れない。
 *
 * ■だからこれは何をするか
 *   ①生の応答(fetch) ②Planner.parsePlan の戻り値 ③保存された本文 の3段階で指標だけを採る。
 *   **本文は書き換えない。例外は必ず投げ直す。判定も修正もしない。**
 *   異常が出たターンだけ1件記録する(正常ターンは記録しない=容量を食わない)。
 *
 * ■指標(GPT指定)
 *   ・maxRun  : 句読点(、。！？…)なしで続く最長文字数
 *   ・over80  : 80字以上の無句読点区間の数     ← 主指標
 *   ・over55  : 55字以上の無句読点区間の数     ← 参考
 *   ・marks   : 本文全体の句読点の数
 *   ・len     : 文字数
 *   加えて model / outLen / finish_reason / 段階(stage) を残す。
 *
 * OFF   = localStorage['v292Dfix553Off'] = '1'
 * 読出  = window.__v292Dfix553.dump() / .stats() / .clear() / .metrics(text)
 * 保存先= localStorage['v292Dfix553_log'](上限30件・古いものから捨てる)
 *
 * ============================================================================
 * ★Q119 PHASE B WATCHER LIVENESS FIX (q119b5) FOR S4 TOPOLOGY(②C1 裁定 ER・縮小版 B+C+D) — offline candidate
 *   ★lineage = candidate/q119b5/。
 *     base   = candidate/q119b4/v292Dfix553-punct-probe.js
 *              sha256 6a2758b6801a84bda893dd34b4fc99f56a6d69ffc8cad085e894a35bc76b0e1c / 52284 B（FROZEN・現 live）
 *     topology base = candidate/q119s4/（Phase A DEFAULT ON ＋ CASE_VIEW γ・5 file）
 *     q119b / q119b2 / q119b3 / q119b4 / q119s4 は 1 バイトも置き換えない。
 *     q119b の 13/13・q119b2 の 24/24・q119b3 の 32/32・q119b4 の 33/33 の記録は
 *     それぞれの実体に対して有効なまま残る。
 *     ★q119b4（現 live / DEFAULT ON）＝ **physical rollback 先 R-B1'**、
 *       q119b3（DEFAULT OFF / SB-2 canary PASS の proven baseline）＝ **R-B1**(②C1 裁定 EM-4)。
 *
 *   ★直す欠陥 = Q119B4_PHASE_B_WATCHER_UNBOUNDED_IN_T1_LOAD
 *     （CONFIRMED_RUNTIME_LIVE + CONFIRMED_SOURCE ／ gold/F537HS_SH1_INERT_PLACEMENT_LIVE_v1.md §3）
 *     live 観測: T1 topology（最外殻 Planner.parsePlan に __v292Dfix277q が無い load・[__f553,__f648]）で
 *       q119b4 の pbF277Quiescent() が fix277 marker を要求するため **永久に false** →
 *       quiescence 窓が開かず reattachOnce に到達せず、pbWatch が 500ms ごとに無限に回る
 *       （watchTicks 31 @ 53s・reattachCalls 0・layers 1・iAmOutermost true・watcherDone false）。
 *       このとき fix553 wrap#1 は既に最外殻なので、本来は stop/already-outermost で閉じるべきだった。
 *
 *   ★QUIESCENCE AUTHORITY = PARSEPLAN REFERENCE STABILITY, NOT FIX277 MARKER（②C1 裁定 ER-2・逐語）
 *     手順（pbWatch の 1 tick）:
 *       (1) registry exactly 4/4（既存 pbProofDecide・PB_PROOF_GRACE_TICKS=12 不変）。
 *       (2) Planner.parsePlan の **reference identity** が既存 quiescence margin
 *           （PB_QUIESCE_MARGIN_MS=1500 不変）の間 1 度も変わらないことを観測する。
 *           誰か（fix277 / fix645 / fix648 / 他）が代入すれば参照が変わる = 窓を取り直す。
 *       (3) 窓が満了した時点で fix553 が既に最外殻（pbIAmOutermost）なら **再 wrap せず**
 *           'stop/already-outermost' で latch して watcher を停止する。
 *           最外殻でなければ従来どおり **ちょうど 1 回**だけ reattach して停止する。
 *     ★fix277 marker（__v292Dfix277q / __v292Dfix277b2）は **診断情報へ降格**した。
 *       pbF277Quiescent() は残すが **authority 経路から呼ばない**（_pbState の f277Quiescent は診断のみ）。
 *     ★健全性: fix277 の installParse() は「marker が parsePlan に無いとき」だけ再代入する。
 *       marker が消えるのは誰かが parsePlan に代入したときだけなので、参照 identity の安定は
 *       marker 到着の **上位条件**である（marker 条件で待てた事象はすべて参照条件でも待てる）。
 *       逆に T1（marker が永久に来ない load）では参照条件だけが決着できる。
 *
 *   ★HARD WATCH BUDGET = REQUIRED（②C1 裁定 ER-2・二重安全弁）
 *     PB_WATCH_MAX_TICKS = 240（既存 pbWatch の 500ms tick の本数上限。新しいタイマーは 1 本も足さない）
 *     ★BUDGET EXHAUSTION MUST STOP, NEVER BLIND-REATTACH:
 *       上限到達で watcher を停止し（pbDone=true）、**現 topology をそのまま保持**して
 *       reattach は 1 回も行わない。trace 'stop/budget-exhausted' と _pbState.budgetExhausted の
 *       診断だけを残す（新永続 write 0）。
 *     ★恒久値ではなく offline 実測に基づく bounded constant:
 *       正常経路の最大 tick 数（late-install / lateReg / fix277-watchdog 最大 / registry 後から 4/4）を
 *       harness が実測し、その最大 × 余裕（≥3）が定数以下であることを機械検査する
 *       （受入 W-7。wall-clock 値そのものは acceptance にしない = B13 と同じ作法）。
 *
 *   ★q119b4 から引き継ぐもの（1 バイトも変えない）:
 *     DEFAULT ON ／ kill 2 本（v292Dfix553PbOff / v292DQ119PageCanaryOff）／ session opt-in 廃止 ／
 *     RUNTIME_PHASE_A_PROOF（registry ちょうど 4/4・grace 12 tick・pre-reattach 再読）／
 *     reattachOnce latch ／ 機構 B の参照 identity 最外殻判定 ／ 機構 C の activeId 短絡。
 *     新永続 write 0 ／ 新タイマー 0 ／ parse ごとの storage read 0 ／ WRITE / capture / poll 側 無変更。
 *   ★ROLLBACK（q119b5）:
 *     (R-B0 論理) localStorage['v292Dfix553PbOff']='1' ＋ reload でその profile だけ OFF
 *     (R-B1' 物理・第一) fix553 を q119b4 6a2758b6…(52284 B) へ戻す（= 現 live・欠陥ごと戻る）
 *     (R-B1  物理・第二) fix553 を q119b3 c7dbfad4…(50845 B) へ戻す（Phase B DEFAULT OFF の proven baseline）
 *     (R-B2  物理・第三) fix553 を production 7913a971…(27294 B) へ戻す（Phase B 撤去）
 *
 *   ★SB-3 DEFAULT ON ／ SESSION OPT-IN ABOLISHED ／ FAIL CLOSED ／ '1' の厳密一致のみ
 *   ★REQUIRES REGISTRY 4-4 (RUNTIME_STATE_PROOF)
 *     = Phase A が「その page で実効」であることの証明は window.__v292WrapReg の 4 key であり、
 *       S4 では opt-in flag が存在しないので flag では判定できない(設計 §1-1 / §5-2)。
 *   ★DEFAULT ON STILL REQUIRES REGISTRY 4-4（②C1 裁定 EM-1・安全境界）
 *     既定 ON は「権限」であって「証明」ではない。registry がちょうど 4 key・全 true の
 *     RUNTIME_PHASE_A_PROOF が無い page では **絶対に reattach しない**
 *     (partial / undefined は inert latch のまま。q119b3 から 1 行も変えていない)。
 *   ★DEPLOY SEPARATE FROM S4: 本 file は S4 build と同じ release に混ぜない。
 *     SB-1(inert 配置・済) → SB-2(QA tab canary・PASS/CLOSED) → SB-3(★本 file・DEFAULT ON) と段階を踏む。
 *     upload は 3 file のみ(fix553 / index.html の cb+BUILT 2 行 / version.txt)。
 *
 *   PHASE_B_CANDIDATE_REQUIRES_PHASE_A_GROWTH_STOP_CORE
 *     この変更は Phase A(fix74/78/645/648 の wrapParse INSTALL_ONCE 化)が入っている
 *     topology を前提にする。Phase A 無しの chain 無限成長下では意味を持たない。
 *
 *   PHASE_B_REQUIRES_PHASE_A_EFFECTIVE（★SB-3 版・intent の既定値を ON へ反転）
 *     DECLARED_INTENT(IIFE で 1 回だけ読む・page 生存中の定数):
 *       localStorage ['v292Dfix553PbOff']       !== '1'   (Phase B kill・profile 全体・最優先)
 *       AND localStorage ['v292DQ119PageCanaryOff'] !== '1'   (Phase A kill・profile 全体)
 *       = gate flag は **kill 2 本だけ**。key 未設定(= 普通の page)なら **既定 ON**。
 *       storage read が throw したら **OFF**(明示的 fail closed。lsg() 経由の暗黙 null に頼らない)
 *     ★sessionStorage['v292DQ119PhaseBOn'](旧 Phase B opt-in)は **読まない = 廃止**。
 *       立てても消しても何も起きない(S4 §1-2 と同じ作法・受入 D-2 / D-5)。
 *       frozen q119b3 はこの opt-in read を **持ったまま**凍結されている。
 *     ★sessionStorage['v292DQ119PageCanaryOn'] は **読まない**(q119b3 の決定を継承)。
 *     ★localStorage['v292Dfix553PbOn'] も **読まない**(q119b2 / q119b3 の決定を継承)。
 *     ★読むだけの key は 2 本(q119b3 は 3 本・q119b2 は 4 本)。新しい永続データは 1 バイトも書かない。
 *       ★実行コード中の sessionStorage 参照は **0 件**(受入 D-5 で機械計数)。
 *     ★opt-in 廃止により gate は localStorage の 2 本(v292Dfix553PbOff / v292DQ119PageCanaryOff)へ揃った
 *       (q119b2/q119b3 の接頭辞非対称 OQ-B3 は解消)。
 *     FLAG_MUST_BE_SET_BEFORE_PAGE_LOAD ／ kill は per-call ではない(効かせるには reload)
 *     ★kill は「この profile で Phase B を止める」という **declared intent** であって、
 *       「Phase A が実際に install した」という **runtime proof** ではない(設計 §4-1)。
 *       runtime proof は下の registry 4-4 だけが与える。
 *
 *   ★REQUIREMENT WORDING（②C1 裁定 EI・逐語）
 *     「fix553 は、**それ以降どの production wrapper も plan を書き換えない地点**で
 *       最終 plan 境界を正しく観測できなければならない」。
 *     = 要求は「物理的に永久に最外殻であること」では **ない**。
 *       機構 B は参照 identity で「いま自分が最終境界に居るか」を見るだけであり、
 *       のちに他の fix が Planner.parsePlan を包み直したら、その層は機構 C により
 *       自分から inert になる(telemetry / lastRaw に一切触らない)。
 *     ★fix845(DEFAULT OFF・最後尾)を有効化した場合は、fix845 が plan を書き換えるかどうかで
 *       この条件が変わりうる。**fix845 activation 時は pairing を再検証すること**
 *       (S4 設計 §12 / Q119S4 OI-5 の X-4 / X-6 と同じ申し送り)。本 lineage は fix845 OFF の
 *       topology でのみ受入値を持つ。
 *
 *   PHASE_B_MUST_NOT_REATTACH_UNLESS_PHASE_A_REGISTRY_COMPLETE（★q119b2 から 1 行も変えない）
 *     ★S4 では Phase A が DEFAULT ON なので、実効な page では registry が必ず 4/4 になる
 *       (PHASE_A_REGISTRY_IS_RUNTIME_STATE_PROOF・S4 設計 §1-1)。q119b2 の OI-4
 *       「S4 で registry を誰が書くのか」はこれで解消している。
 *     fix553 は index.html idx 24 で走り、Phase A の 4 file(idx 56/65/267/268)より **先**なので、
 *     IIFE 時点では window.__v292WrapReg は必ず undefined である。よって runtime proof は
 *     **pbWatch の判定の瞬間・pbReattachOnce() の直前**に評価する:
 *       window.__v292WrapReg が {f74parse,f78parse,f645parse,f648parse} の
 *       **ちょうど 4 key・すべて === true** であること(registry のみを見る。marker は使わない)。
 *       undefined → proof 'undefined' ／ それ以外の過不足 → proof 'partial' → **どちらも再装着しない**。
 *     ★proof が最終的に不成立なら Phase B の意味論を **丸ごと inert** にする:
 *       pbLive=false ／ pbDone=true(監視終了) ／ 再装着 0 ／ 以後 install 判定も activeId 判定も
 *       OFF(production)経路と同一になる。= captures / telemetry の意味論が OFF arm と一致する。
 *     ★registry が **後から** 4/4 になる場合に備え、判定は既存 pbWatch の 500ms tick を
 *       **最大 PB_PROOF_GRACE_TICKS(=12) 回だけ**再利用して再評価する(bounded)。
 *       新しいタイマーは 1 本も足さない。exactly-once latch(pbReattached)は 1 ミリも緩めない。
 *     ★評価点は 2 つ。どちらも registry だけを読む:
 *       (P1) pbWatch の各 tick 冒頭。complete を観測するまで **quiescence 窓を開始しない**
 *            (= reattachOnce lifecycle にそもそも入らない)。complete で latch(pbProofOK)。
 *            budget を使い切ったら inert 確定。
 *       (P2) pbReattachOnce() の **直前**。latch 済みでも必ずもう一度読む。
 *            ここで不成立なら再装着せず、その場で inert 確定(grace は使わない)。
 *
 *   既定 = ON。kill が立った page / localStorage が読めない page では機構 B/C/D がすべて素通りし、
 *   監視タイマーも起動しない = Phase A 時点の fix553 と挙動が同一(= q119b3 の OFF 経路と同一)。
 *   ★PHASE B 自身の段階(設計 v3 §4・Phase A の S1→S2→S4 を写す):
 *       SB-1 inert 配置(q119b3・flag 0 で全 user PB=false・済)
 *       SB-2 QA tab canary(q119b3 ＋ sessionStorage opt-in・PASS/CLOSED)
 *       SB-3 DEFAULT ON(q119b4・現 live)
 *       SB-4 WATCHER LIVENESS FIX(★本 file = q119b5。DEFAULT ON を継承・PRODUCTION DEPLOY は HOLD)
 *     ★本 file に inert 配置段階は無い(deploy した瞬間に全 page で Phase B が既定 ON になる)。
 *   ★ROLLBACK(②C1 裁定 EM-4 / ER を継承・詳細は上の q119b5 ROLLBACK 節):
 *     (R-B0 論理・profile 単位) localStorage['v292Dfix553PbOff']='1' ＋ reload でその profile だけ OFF
 *       (Phase A kill localStorage['v292DQ119PageCanaryOff']='1' でも Phase B は止まる)。
 *       単一 profile / 単一 page の異常のみに使う。
 *     (R-B1' 物理・第一の fleet rollback) fix553 を **q119b4 の
 *       6a2758b6801a84bda893dd34b4fc99f56a6d69ffc8cad085e894a35bc76b0e1c(52284 B)** へ戻す
 *       = 現 live へ戻る(T1 watcher 欠陥も一緒に戻ることを承知のうえで使う)。
 *     (R-B1 物理・第二段) fix553 を **q119b3 SB1 package の
 *       c7dbfad469b99af2c1275fb429467cb5a8471cd0648301090443bf548f5c8385(50845 B)** へ戻す
 *       = Phase B を production resident / session opt-in の proven baseline へ戻す。
 *     (R-B2 物理・第三段) fix553 を production 7913a971…(27294 B) に戻して Phase B コードごと撤去。
 *   ★裁定 DZ により機構 A(Planner.parsePlan の accessor 化 = assignment provenance
 *     recorder)は **採用しない**。production 側に accessor は 1 つも張らない。
 *   機構 B: 「自分が最終 plan 境界に居るか」の権威は **参照 identity**
 *           (Planner.parsePlan === 自分が作った wrapper)。__f553 は DIAGNOSTIC ONLY。
 *   機構 C: 各 wrapper 層の先頭で activeId を見る。active でない層は telemetry にも
 *           lastRaw/pairedRaw にも **一切触れずに** 元の戻り値を返す。
 *   機構 D: ★q119b5 で権威を差し替えた。待機窓の条件は **Planner.parsePlan の参照 identity が
 *           margin の間不変であること**であり、fix277 marker は読まない(診断へ降格)。
 *           窓が満了した時点で自分が最外殻なら再装着せず停止し、そうでなければ
 *           **ちょうど 1 回だけ** 再装着する(latch)。二度目は無い。
 *           さらに tick 数の hard budget(PB_WATCH_MAX_TICKS)で watcher が必ず有限回で止まる。
 * ============================================================================
 */
(function v292Dfix553(){
  if (window.__v292Dfix553) return;
  var TAG = '[v292Dfix553]';
  var LOG = 'v292Dfix553_log';
  var MAX = 30;
  var OVER = 80;            /* 主指標のしきい値 */
  var OVER2 = 55;

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix553Off') === '1'; }

  /* ---- ★Q119 Phase B: DECLARED_INTENT と page-local state ----------------
     flag は page 生存中 1 回だけ読む(parse ごとに storage を読まない = 挙動差を作らない)。
     新しい永続データは 1 バイトも書かない。読むだけの key が 2 つ(q119b3 は 3 つ・q119b2 は 4 つ)。
     ★read は 1 本ずつ try/catch し、catch は return false(明示的 fail closed)。
       lsg() は throw 時に null を返すので、4 file 側(q119s4 paRead)と意味論が割れる。 */

  /* (1) ★S4 の Phase A kill を q119s4 の paRead() と **同じ意味論**で読む(kill を読めて '1' でない)。
         q119b2 の pcRead553() から sessionStorage['v292DQ119PageCanaryOn'] の read を **削除**した形。
         S4 build には opt-in が存在しないので、読むと Phase B が永久 OFF になる(設計 v3 §2)。 */
  function paRead553(){
    try { return window.localStorage.getItem('v292DQ119PageCanaryOff') !== '1'; } catch(e){ return false; }
  }
  /* (2) ★SB-3: Phase B の opt-in は **廃止**した。sessionStorage['v292DQ119PhaseBOn'] は読まない
         (立てても消しても何も起きない)。gate は kill 2 本だけで、どちらも立っていなければ **既定 ON**。
         ★localStorage['v292Dfix553PbOn'] も **この lineage では読まない**(q119b2/q119b3 を継承)。
         ★実行コード中の sessionStorage 参照は 0 件(受入 D-5)。 */
  function pbOn(){
    try { if (window.localStorage.getItem('v292Dfix553PbOff') === '1') return false; } catch(e){ return false; }  /* kill が勝つ */
    if (!paRead553()) return false;                                     /* ★Phase A kill が立っていれば fail closed OFF */
    return true;                                                    /* ★SB-3 DEFAULT ON（EXECUTION DIFF BUDGET = この 1 行） */
  }
  var PB = pbOn();                  /* ★DECLARED_INTENT（page 生存中の定数・以後書き換えない） */
  /* ★pbLive = 「いま実際に Phase B 意味論が生きているか」。初期値は DECLARED_INTENT。
     RUNTIME_PHASE_A_PROOF が最終的に不成立になった瞬間に false へ落ち、二度と true に戻らない
     (単調・latch)。機構 B/C/D はすべて **pbLive** を見る。 */
  var pbLive = PB;
  var PB_QUIESCE_MARGIN_MS = 1500;  /* fix277 waitP の周期 500ms(fix277 L786)× 3 周期（q119b4 から不変） */
  /* ★q119b5 HARD WATCH BUDGET（二重安全弁・②C1 裁定 ER-2）
     既存 pbWatch の 500ms tick を数えるだけの上限。新しいタイマーは 1 本も足さない。
     上限到達 = 「決着できない page」と確定し、watcher を止めて現 topology を保持する。
     ★BUDGET EXHAUSTION MUST STOP, NEVER BLIND-REATTACH（reattach は 1 回も行わない）。
     根拠（offline 実測・受入 W-7 で機械計算）: 正常経路の最大 tick 数は
       通常 load / lateReg(registry 後から 4/4) / late-install / fix277-watchdog 最大（fix277 waitP が
       build を 500ms×最大 61 回待つ間 parsePlan は再代入されない）でも 70 tick を超えない。
       その ×3 以上の余裕を取って 240 tick(= 既存 tick 周期で 120 秒相当)とした。
     ★wall-clock 値そのものは acceptance 条件にしない（②C1 裁定 EG SM-2 / 受入 B13 と同じ作法）。 */
  var PB_WATCH_MAX_TICKS = 240;
  /* ★RUNTIME_PHASE_A_PROOF（PHASE_B_MUST_NOT_REATTACH_UNLESS_PHASE_A_REGISTRY_COMPLETE） */
  var PB_REG_KEYS = ['f74parse', 'f78parse', 'f645parse', 'f648parse'];
  var PB_PROOF_GRACE_TICKS = 12;    /* ★既存 pbWatch の 500ms tick を最大 12 回だけ再利用(= 6s)。
                                       新しいタイマーは 1 本も足さない。budget を使い切ったら inert 確定。 */
  var pbProofTries = 0;
  var pbProofOK = false;            /* complete を一度でも観測したら latch(true)。緩めるのは latch ではなく窓の開始条件だけ */
  var pbProof = { proof: 'undefined', keys: [], extra: [], decidedAt: 0, tries: 0, final: false, at: null };
  var pbSeq = 0;                    /* 自分が作った wrapper の通し番号 */
  var pbActiveId = 0;               /* 機構 C: 現在 active な層の id。これ以外の層は完全に inert */
  var pbMyFns = [];                 /* 機構 B: 自分が作った wrapper 関数の **参照そのもの** */
  var pbReattached = false;         /* 機構 D: 再装着 latch(成否によらず二度目は無い) */
  var pbReattachCalls = 0;
  var pbDone = false;               /* 監視ループ終了 latch(再起動しない) */
  var pbWatchTicks = 0;
  var pbQuiesceSince = 0;           /* ★q119b5: 参照 identity が安定し始めた時刻 */
  var pbQuiesceFn = null;           /* そのときの Planner.parsePlan 参照(代入の有無を identity で見る) */
  var pbQuiesceRestarts = 0;        /* ★q119b5 診断: 窓を取り直した回数(= margin 内の代入回数) */
  var pbBudgetOut = false;          /* ★q119b5 診断: HARD WATCH BUDGET を使い切って停止したか */
  var pbTrace = [];                 /* 診断のみ。最大 20 件 */
  function pbLog(ev){ try { if (pbTrace.length < 20) pbTrace.push({ ev: ev, ts: Date.now() }); } catch(e){} }

  function getPlanner553(){
    try { return window.Planner || (function(){ try { return (0,eval)('typeof Planner!=="undefined"?Planner:null'); } catch(e){ return null; } })(); }
    catch(e){ return null; }
  }
  /* 機構 B: marker(__f553)は **一切見ない**。自分が作った最新の wrapper と参照比較する。
     実測(gold/Q119_PHASE_B_OUTERMOST_IDENTITY_v1.json)では最外殻に __f553 が付いていても
     所有者は fix277 でありうる = MARKER_ON_OUTERMOST_IS_NOT_INSTALL_STATE。 */
  function pbIAmOutermost(){
    try {
      var P = getPlanner553();
      if (!P || typeof P.parsePlan !== 'function') return false;
      return pbMyFns.length > 0 && P.parsePlan === pbMyFns[pbMyFns.length - 1];
    } catch(e){ return false; }
  }
  /* ★q119b5: DIAGNOSTIC ONLY へ降格した（②C1 裁定 ER-2「fix277 marker は診断情報へ降格」）。
     この関数は _pbState().f277Quiescent からしか呼ばれない。pbWatch の authority 経路からは
     **1 か所も呼ばない**（受入 SRC-5 で機械計数する）。
     降格の理由（live 実測）: T1 topology（最外殻に __v292Dfix277q が無い load）では
     この式が永久に false になり、quiescence 窓が開かないまま watcher が無限に回った。
     機構 D: fix277 の停止条件を **fix277 自身の式と同じ形**で、外から読み取りだけで評価する。
       v292Dfix277-quasi-pack.js L777  var a = installParse();
                                 L726  if (P.parsePlan.__v292Dfix277q) return true;   → a の実体
                                 L784  var b = ready ? installBuild() : false;
                                 L757  if (P.build.__v292Dfix277b2) return true;      → b の実体
                                 L785  if (a && b) return;                            → 恒久停止
     fix277 は 1 バイトも変更していない。ここで marker を読むのは「自分の install 状態」を
     決めるためではなく、「他 fix の lifecycle が終わったか」を見るためである(機構 B とは役割が違う)。 */
  function pbF277Quiescent(){
    try {
      var P = getPlanner553();
      if (!P || typeof P.parsePlan !== 'function' || typeof P.build !== 'function') return false;
      if (!P.parsePlan.__v292Dfix277q) return false;
      if (!P.build.__v292Dfix277b2) return false;
      return true;
    } catch(e){ return false; }
  }

  /* ★RUNTIME_PHASE_A_PROOF（本 lineage の新設・読み取り専用）
     Phase A(q119pc / q119s4)が install した page では window.__v292WrapReg が
     {f74parse,f78parse,f645parse,f648parse} の 4 key すべて true になる(q119pc 受入 ON-5 / q119s4 受入 D-4)。
     OFF の page では undefined(OFF-8)。partial は SPLIT。
     ★registry だけを見る。marker(__v292Dfix74w / __f645 など)は **使わない**
       (marker は他 fix の包み直しで消えるため install state の権威にならない)。
     ★過不足を許さない: own key が **ちょうど 4 個**で、その 4 個が上の集合と一致し、
       すべて === true のときだけ complete。 */
  function pbPhaseAProof(){
    var R = null;
    try { R = window.__v292WrapReg; } catch(e){ return { proof:'undefined', keys: [], extra: [], complete:false }; }
    if (R === undefined || R === null || typeof R !== 'object')
      return { proof:'undefined', keys: [], extra: [], complete:false };
    var own = [];
    try { own = Object.keys(R); } catch(e){ return { proof:'undefined', keys: [], extra: [], complete:false }; }
    var hit = [], extra = [], i;
    for (i = 0; i < PB_REG_KEYS.length; i++){
      try { if (R[PB_REG_KEYS[i]] === true) hit.push(PB_REG_KEYS[i]); } catch(e){}
    }
    for (i = 0; i < own.length; i++){ if (PB_REG_KEYS.indexOf(own[i]) < 0) extra.push(own[i]); }
    var complete = (hit.length === 4 && own.length === 4 && extra.length === 0);
    return { proof: complete ? 'complete' : 'partial', keys: hit, extra: extra, complete: complete };
  }

  /* ---- 指標 ---------------------------------------------------------- */
  /* 「、。！？…」に加えて、この作品で文の区切りに使われる ——／──／\n も区切りとして数える。
     そうしないと「——」で繋いだ正常な長文まで異常として拾ってしまう(実測で誤検出した)。 */
    /* ★fix560(GPT裁定): 単独の「―」を無条件で区切りにすると、**本物の長文崩れを途中で分断して見逃す**。
     実データの用法は「文章―挿入部分―文章」の**対**なので、次の3段で扱う:
       ・連続した ―― / ――― … 常に区切り
       ・同じ段落に単独の ― が2個以上 … 対になった挿入区切りとして区切る
       ・単独の ― が1個だけ … 区切りにしない(診断候補として記録するだけ)
     判定は**段落ごと**に行う(metricsは複数段落をまとめて受け取ることがあるため)。 */
  var SPLIT = /[、。！？!?…；\u0001]/;
  var SEP = '\u0001';
  function normalizeSeparators(line){
    var s = String(line == null ? '' : line);
    s = s.replace(/——+/g, SEP).replace(/──+/g, SEP).replace(/―{2,}/g, SEP);
    var singles = (s.match(/―/g) || []).length;
    if (singles >= 2) s = s.replace(/―/g, SEP);
    return s;
  }
  function metrics(text){
    var s = String(text == null ? '' : text);
    /* ★fix553c: タグは3段階すべてで先に落とす。plan.narrative には <say who="…">…</say> が
       要素として入るので、落とさないと段階間で土俵が揃わない。 */
    s = s.replace(/<[^>]*>/g, '');
    var max = 0, o80 = 0, o55 = 0;
    s.split('\n').forEach(function(line){
      normalizeSeparators(line).split(new RegExp(SPLIT.source, 'g')).forEach(function(p){
        var n = p.trim().length;
        if (n > max) max = n;
        if (n >= OVER) o80++;
        if (n >= OVER2) o55++;
      });
    });
    var marks = (s.match(/[、。！？!?…]/g) || []).length;
    return { len: s.length, marks: marks, maxRun: max, over80: o80, over55: o55 };
  }

  function bad(m){ return !!(m && m.over80 > 0); }

  /* ---- 記録 ---------------------------------------------------------- */
  function read(){ try { var a = JSON.parse(lsg(LOG) || '[]'); return Array.isArray(a) ? a : []; } catch(e){ return []; } }
  function write(a){
    /* fail-closed: 書けなければ黙って諦める(fix543が本物の保存失敗を見ているので、
       診断の書込み失敗でユーザの物語を止めない)。ただし自分のキーは fix543 の集計に混ぜない。 */
    try { localStorage.setItem(LOG, JSON.stringify(a.slice(-MAX))); } catch(e){}
  }
  /* ★fix553b: 見張り自身が止まっていても気づけるように polls/lastPollTs を出す。
     この検出器は「異常が無ければ何も記録しない」設計なので、記録0のとき
     「本当に0なのか、見張りが死んでいるのか」を区別できないと今日ずっと潰してきた
     『無言の空振り』を自分でやることになる。 */
  var stats = { turns: 0, flagged: 0, polls: 0, lastPollTs: 0,
                byStage: { model: 0, parse: 0, postprocess: 0, unknown: 0 },
                /* ★fix553e(GPT指定): 異常ログ0件は**それだけでは何の証明にもならない**。
                   「1ターンについて3段階が揃った件数」が生存証明になる。 */
                capture: { raw: 0, rawUsable: 0, parsed: 0, saved: 0, all3: 0, rawApprox: 0,
                           extraFetches: 0, overwritePrevented: 0, pairInvalid: 0, incomplete: 0 } };

  /* ★fix553d(2026-07-25・実機で誤ラベルしたので修正):
     「前の段階が**正常だったのに**次の段階で崩れた」ときだけ、その段階を犯人と呼ぶ。
     直す前は `if (s2 && bad(s4)) return 'postprocess'` だったので、
     **s2 も s4 も崩れている**ケース(=後処理は無実)を postprocess と呼んでいた。
     実際に turn51 でそれが起きた(s2 も s4 も marks=1 / maxRun=490 で同一なのに postprocess と出た)。 */
  /* ★fix553e(2026-07-25・実機で誤ラベルしたので追加): 生の抽出は**部分的にしか取れないことがある**。
     実測: turn92 は生が99字しか取れていないのに、パース後は776字あった(=別のfetchを拾ったか抽出失敗)。
     その99字が「きれい」だからといって「生は正常だった」とは言えないのに、`parse` と断定していた。
     → 生が後段の6割の長さに届かないときは**生は無かったことにして、段階を断定しない**。 */
  function usable(s1, ref){
    if (!s1 || !ref) return false;
    return s1.len >= Math.floor(ref.len * 0.6);
  }
  function stageOf(s1raw, s2, s4){
    var s1 = usable(s1raw, s2 || s4) ? s1raw : null;
    if (bad(s1)) return 'model';                                  /* 生の時点で崩れている */
    if (s1 && !bad(s1) && bad(s2)) return 'parse';                /* 生は正常 → パース段で崩れた */
    if (s2 && !bad(s2) && bad(s4)) return 'postprocess';          /* パース後は正常 → 後段で崩れた */
    if (!s1 && bad(s2)) return 'parse-or-model';                  /* 生が取れていない */
    if (!s2 && bad(s4)) return 'postprocess-or-earlier';          /* パース後が取れていない */
    return 'unknown';
  }

  function record(rec){
    var a = read(); a.push(rec); write(a);
    stats.flagged++;
    var k = rec.stage;
    if (stats.byStage[k] == null) stats.byStage[k] = 0;
    stats.byStage[k]++;
    try { console.warn(TAG, '句読点崩れを検出', rec.stage, rec); } catch(e){}
  }

  /* ---- ①生の応答をとる(fetchを包む) ----------------------------------- */
  var lastRaw = null;   /* { text, metrics, finish, model, ts } */

  function pickText(json){
    /* Worker/OpenRouter/Anthropic のどれでも本文らしき文字列を拾う。取れなければ null。 */
    try {
      if (!json) return null;
      if (typeof json === 'string') return json;
      if (json.choices && json.choices[0]){
        var c = json.choices[0];
        if (c.message && typeof c.message.content === 'string') return c.message.content;
        if (typeof c.text === 'string') return c.text;
      }
      if (Array.isArray(json.content)){
        var out = '';
        for (var i = 0; i < json.content.length; i++){
          if (json.content[i] && typeof json.content[i].text === 'string') out += json.content[i].text;
        }
        if (out) return out;
      }
      if (typeof json.output === 'string') return json.output;
      if (typeof json.text === 'string') return json.text;
    } catch(e){}
    return null;
  }
  /* ★fix553c(2026-07-25・実機で誤検出したので追加): 生の応答文字列をそのまま測ってはいけない。
     モデルはJSONを返す契約なので、`{"playerIntent":"…","branchCandidates":[…]` のような
     **構造そのもの**が「句読点の無い長い区間」に化け、正常なターンを stage=model と誤判定した
     (実測: 生 maxRun=110/over80=2 なのに、パース後も保存後も maxRun=34/over80=0)。
     → 生からも**本文(narrative)だけ**を取り出し、②③と同じ土俵で測る。
     取り出せなければ null を返し、**段階を断定しない**。 */
  function narrativeFromRaw(t){
    var s = String(t == null ? '' : t).trim();
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    try {
      var j = JSON.parse(s);
      if (j && Array.isArray(j.narrative)) return j.narrative.join('\n');
    } catch(e){}
    var m = s.match(/"narrative"\s*:\s*\[([\s\S]*?)\]/);
    if (m){
      try { var arr = JSON.parse('[' + m[1] + ']'); if (Array.isArray(arr)) return arr.join('\n'); } catch(e2){}
    }
    /* ★★fix553f(2026-07-25・実応答を覗いて判明): **応答はJSONではない**。
       新エンジン(fix192)の応答は「素の本文 + <say>/<state>/<react> タグ」だった。
       JSON前提の抽出が全ターンで失敗し、近似も文字列リテラルを拾えず、
       rawUsable が **8ターン中0** = 生を一度も使えていなかった。
       submit() と同じく `<react` / `<state` の手前までを本文とみなす。
       実測で検証済み: 生の本文671字 vs 保存655字 = 102% / maxRun は 35 で完全一致。
       ★fix645: <scene_move> も本文の終わりとして扱う（句読点の無い60字のタグが maxRun を
         押し上げて誤検出になるため）。fix645 が OFF／未ロードならタグは現れない＝挙動不変。 */
    var body = s.split(/<react|<state|<scene_move/)[0];
    if (body && body.replace(/<[^>]*>/g, '').trim().length >= 40) return body;
    return null;
  }
  /* ★fix553d: モデルが壊れた出力を返すと JSON として読めず、上の2手が両方失敗して
     **いちばん知りたいケースで生が測れなくなる**(実測: turn51 は s1_raw=null だった)。
     最後の手段として「20字以上の文字列リテラルだけ」を集める。キー名は短いので入らず、
     構造記号も入らないので、JSONそのものを測る誤検出は起きない。近似なので approx を立てる。 */
  function narrativeApprox(t){
    var s = String(t == null ? '' : t);
    var lits = s.match(/"(?:[^"\\]|\\.)*"/g);
    if (!lits) return null;
    var out = [];
    for (var i = 0; i < lits.length; i++){
      var v = null;
      try { v = JSON.parse(lits[i]); } catch(e){ v = lits[i].slice(1, -1); }
      if (typeof v === 'string' && v.length >= 20) out.push(v);
    }
    return out.length ? out.join('\n') : null;
  }

  function pickFinish(json){
    try {
      if (json && json.choices && json.choices[0]) return json.choices[0].finish_reason || json.choices[0].stop_reason || null;
      if (json && json.stop_reason) return json.stop_reason;
    } catch(e){}
    return null;
  }
  function pickModel(json){ try { return (json && json.model) || null; } catch(e){ return null; } }

  /* ★fix554: 応答の種別を中身で判定する(順序依存をやめる)。
     会話ログ(genConvLog)は [{"who":"…","say":"…"}] のJSON配列を返す契約。
     本文は素のプロセ+<say>/<state>/<react> タグ、または narrative を含むJSON。 */
  function kindOf(t){
    var s = String(t == null ? '' : t).trim();
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    if (/^\[/.test(s)){
      try { var a = JSON.parse(s); if (Array.isArray(a) && (!a.length || (a[0] && (a[0].who != null || a[0].say != null)))) return 'convlog'; }
      catch(e){ if (/"who"\s*:/.test(s) && /"say"\s*:/.test(s)) return 'convlog'; }
    }
    if (/"who"\s*:\s*"/.test(s) && /"say"\s*:\s*"/.test(s) && s.indexOf('<state') < 0 && s.indexOf('<react') < 0) return 'convlog';
    if (s.length < 120) return 'other';
    return 'narrative';
  }

  /* ★fix554: 生成単位ID。G.submit の入口で1つ増やす。3段階が「同じ生成のもの」かを見る。 */
  var genSeq = 0;

  /* ★fix554: 内容の指紋。長さが近いだけでは別の応答を偶然ペアにしうる(GPT指摘)。
     20文字以上の共通部分があることを確かめる。 */
  function shareChunk(a, b, n){
    a = String(a || '').replace(/<[^>]*>/g, '').replace(/\s+/g, '');
    b = String(b || '').replace(/<[^>]*>/g, '').replace(/\s+/g, '');
    n = n || 20;
    if (a.length < n || b.length < n) return false;
    for (var i = 0; i + n <= a.length; i += 5){
      if (b.indexOf(a.substr(i, n)) >= 0) return true;
    }
    return false;
  }

  /* ★このラッパは「一度だけ・できるだけ内側(nativeに近い側)」に置く。
     理由: fix482/464/476/80 は `new Response(...)` で応答を作り直すので、外側で読むと
     「出口ガードを通したあとの本文」になり、**モデルの生出力ではなくなる**。
     また fix80 は2秒ごとに最外殻へ包み直し own props を継承しないため、`__f553` が消える。
     そこで「消えたら包み直す」をやると、こちらが最外殻へ移動してしまい目的を失う。
     → 再ラップは絶対にしない。installed フラグで一度きりにする。 */
  var installed = false;
  function wrapFetch(){
    try {
      if (installed) return;
      var prev = window.fetch;
      if (!prev || prev.__f553) { installed = true; return; }
      var wrapped = function(){
        var p = prev.apply(this, arguments);
        if (off() || !p || typeof p.then !== 'function') return p;
        return p.then(function(res){
          /* ★clone() を使い、呼び出し元が読む本体は一切消費しない */
          try {
            if (res && typeof res.clone === 'function' && res.ok){
              res.clone().json().then(function(j){
                try {
                  var t = pickText(j);
                  if (!t) return;
                  /* ★fix554(GPT指定): 「最初のfetchだから本文」という**順序依存をやめる**。
                     応答の中身で本文生成と会話ログ生成を区別する。
                     会話ログは [{"who":"…","say":"…"}] のJSON配列を返す契約(genConvLog)。 */
                  if (kindOf(t) !== 'narrative'){ stats.capture.extraFetches++; return; }
                  var body = narrativeFromRaw(t), approx = false;
                  if (body == null){ body = narrativeApprox(t); approx = (body != null); }
                  if (body == null) return;
                  /* ★上書き防止: 同じ生成単位で本文rawが既にあるなら上書きしない */
                  if (lastRaw && lastRaw.gen === genSeq){ stats.capture.overwritePrevented++; return; }
                  lastRaw = { gen: genSeq, metrics: metrics(body), body: body,
                              bodyLen: body.length, approx: approx,
                              finish: pickFinish(j), model: pickModel(j), ts: Date.now() };
                } catch(e){}
              }, function(){});
            }
          } catch(e){}
          return res;
        });
        /* 失敗は握りつぶさない: then の第2引数を付けないので元の rejection がそのまま伝わる */
      };
      wrapped.__f553 = true;
      /* ★fix419cの掟: 内側関数の own props を全継承する */
      try { Object.keys(prev).forEach(function(k){ if (k !== '__f553') wrapped[k] = prev[k]; }); } catch(e){}
      try { Object.defineProperty(wrapped, 'name', { value: prev.name || 'wrapped', configurable: true }); } catch(e){}
      window.fetch = wrapped;
      installed = true;
    } catch(e){}
  }

  /* ---- ②パース直後をとる(Planner.parsePlan を包む) --------------------- */
  var lastParsed = null;
  var pairedRaw = null;        /* parsePlan が走った瞬間の lastRaw = 本文の生 */
  var parsedCaptures = 0;

  /* ★fix553d: parsePlan は他のfix(fix155/159/427など)が後から包み直すことがあり、
     そのとき own props を継承しないので `__f553` が消える。fetch と違って
     **parsePlan は最外殻の方が正しい**(submit() が実際に受け取る plan を測りたいため)。
     よって消えていたら包み直してよい。ただし「掴めているか」は
     __f553 の有無ではなく **実際に捕捉した回数** で見る(印だけ見ると false negative になる)。 */
  function wrapParse(opt){
    try {
      var P = window.Planner || (function(){ try { return (0,eval)('typeof Planner!=="undefined"?Planner:null'); } catch(e){ return null; } })();
      if (!P || typeof P.parsePlan !== 'function') return false;
      if (pbLive){
        /* ★Phase B: install 判定を marker から **参照 identity** へ差し替える(機構 B)。
           再装着は reattachOnce(force)経由だけに限る = tryParse からは 1 枚目しか積まない。
           → fix553 由来の代入は page 生存中 **最大 2 回**(w1 と w2)に構造的に上限が付く。
           ★pbLive は RUNTIME_PHASE_A_PROOF が不成立になると false へ落ちる。
             落ちた後は下の marker 判定(= production/OFF 経路)へ戻る。 */
        if (!(opt && opt.force)){
          if (pbIAmOutermost()) return false;
          if (pbMyFns.length > 0) return false;
        }
      } else if (P.parsePlan.__f553) return false;   /* OFF = 現行(Phase A 時点)の marker 判定 */
      var prev = P.parsePlan;
      var myId = pbLive ? (++pbSeq) : 0;
      var wrapped = function(){
        var r = prev.apply(this, arguments);      /* 例外はそのまま伝播させる */
        try {
          /* ★Phase B 機構 C: activeId 判定を **いちばん最初に** 行う。
             自分が active な層でなければ telemetry(parsedCaptures / lastParsed)にも
             lastRaw / pairedRaw にも一切触れずに、そのまま元の戻り値を返す。
             OFF のときは pbLive=false で短絡するので 1 行も意味を持たない。
             ★RUNTIME_PHASE_A_PROOF 不成立で pbLive が false へ落ちた後も同じく短絡し、
               この層は production/OFF の層とまったく同じに振る舞う(= 全層が telemetry を触る)。 */
          if (pbLive && pbActiveId !== myId) return r;
          if (!off() && r && Array.isArray(r.narrative)){
            lastParsed = { metrics: metrics(r.narrative.join('\n')), n: r.narrative.length, ts: Date.now() };
            parsedCaptures++;
            /* ★★fix553e(いちばん大事な修正): 1ターンの中で fetch は2回以上走る。
               順番は 本文fetch → parsePlan → 会話ログfetch → 保存 → poll。
               つまり poll の時点で lastRaw は**会話ログの応答**に上書きされている。
               実測: turn92 は生が99字しか無いのに本文は776字あった(= 別の応答を掴んでいた)。
               → parsePlan が走った**この瞬間**の lastRaw を本文の生としてペアにする。 */
            pairedRaw = lastRaw;
            lastRaw = null;
            lastParsed.gen = genSeq;
            lastParsed.body = r.narrative.join('\n');
          }
        } catch(e){}
        return r;
      };
      wrapped.__f553 = true;                       /* ★DIAGNOSTIC ONLY。install 判定には使わない */
      try { Object.keys(prev).forEach(function(k){ if (k !== '__f553') wrapped[k] = prev[k]; }); } catch(e){}
      /* ★L329 と同じ「__f553 以外の own key は全継承」を維持する。
         __v292Dfix277q を落とさないことが fix553↔fix277 の ping-pong 防止の要(補助的観測)。 */
      if (pbLive) pbMyFns.push(wrapped);
      P.parsePlan = wrapped;
      if (pbLive){ pbActiveId = myId; pbLog('wrap#' + myId + (opt && opt.force ? '/force' : '')); }
      return true;
    } catch(e){ return false; }
  }

  /* ---- ★Q119 Phase B 機構 D: 監視ループと「ちょうど 1 回」の再装着 --------- */
  function pbReattachOnce(){
    if (pbReattached) return false;      /* ★構造的な 1 回性(成否によらず二度目は無い) */
    pbReattached = true; pbReattachCalls++;
    pbLog('reattachOnce');
    return wrapParse({ force: true });
  }
  /* ★RUNTIME_PHASE_A_PROOF の判定 1 回分。complete を観測したら latch(pbProofOK)。
     bounded budget(PB_PROOF_GRACE_TICKS)を使い切るまで complete にならなければ inert 確定。
     戻り値 true = 「この tick は先へ進んでよい」。 */
  function pbProofDecide(at){
    var pf = pbPhaseAProof();
    pbProofTries++;
    pbProof = { proof: pf.proof, keys: pf.keys.slice(), extra: pf.extra.slice(),
                decidedAt: Date.now(), tries: pbProofTries, final: false, at: at };
    if (pf.complete){ pbProofOK = true; pbProof.final = true; pbLog('proof/complete#' + pbProofTries); return true; }
    if (pbProofTries >= PB_PROOF_GRACE_TICKS || at === 'pre-reattach'){
      /* ★不成立確定。Phase B 意味論を **丸ごと inert** にする:
         再装着しない・監視も止める・以後の install 判定も activeId 判定も OFF(production)経路と同一。 */
      pbProof.final = true;
      pbLive = false; pbDone = true; pbLog('stop/proof-' + pf.proof + '/' + at);
      return false;
    }
    /* 既存の 500ms tick chain で次も再評価される(bounded)。新しいタイマーは 1 本も足さない。
       registry が後から 4/4 になっても reattachOnce lifecycle の内側で安全に成立する。 */
    pbLog('proof-wait/' + pf.proof + '#' + pbProofTries);
    return false;
  }
  /* ★q119b5: QUIESCENCE AUTHORITY = PARSEPLAN REFERENCE STABILITY（②C1 裁定 ER-2）
     いまの Planner.parsePlan 参照を読むだけの補助関数（production に accessor は張らない）。 */
  function pbPlanFn(){
    try {
      var P = getPlanner553();
      return (P && typeof P.parsePlan === 'function') ? P.parsePlan : null;
    } catch(e){ return null; }
  }
  /* ★q119b5: 参照 identity が margin の間不変であることを観測する 1 tick 分。
     戻り値（診断名も兼ねる）:
       'none'    Planner.parsePlan がまだ関数でない（窓は開いていない）
       'lost'    関数が消えた（開いていた窓を捨てる）
       'start'   窓を開いた
       'restart' 誰かが代入した = 窓を取り直した（fix277 / fix645 / fix648 / 他を区別しない）
       'wait'    まだ margin に届いていない
       'stable'  margin のあいだ 1 度も代入が無かった = quiescence 成立
     ★marker は 1 つも見ない。「代入が無いこと」を参照の不変で確かめるだけである。 */
  function pbQuiesceObserve(now){
    var fn = pbPlanFn();
    if (!fn){
      if (pbQuiesceSince){ pbQuiesceSince = 0; pbQuiesceFn = null; return 'lost'; }
      return 'none';
    }
    if (!pbQuiesceSince){ pbQuiesceSince = now; pbQuiesceFn = fn; return 'start'; }
    if (fn !== pbQuiesceFn){
      pbQuiesceSince = now; pbQuiesceFn = fn; pbQuiesceRestarts++; return 'restart';
    }
    return (now - pbQuiesceSince >= PB_QUIESCE_MARGIN_MS) ? 'stable' : 'wait';
  }
  function pbWatch(){
    if (pbDone) return;
    if (off()){ pbDone = true; pbLog('stop/off'); return; }
    pbWatchTicks++;
    /* ★q119b5 HARD WATCH BUDGET（二重安全弁）: 上限に達したら **何もせずに止まる**。
       reattach は 1 回も行わない(BUDGET EXHAUSTION MUST STOP, NEVER BLIND-REATTACH)。
       現 topology はそのまま保持され、残るのは診断だけ(新永続 write 0)。 */
    if (pbWatchTicks > PB_WATCH_MAX_TICKS){
      pbBudgetOut = true; pbDone = true; pbLog('stop/budget-exhausted'); return;
    }
    try {
      /* ★Phase A registry が complete と証明されるまでは quiescence 窓を **開始しない**
         (= reattachOnce lifecycle にそもそも入らない)。q119b4 から 1 行も変えていない。 */
      if (!pbProofOK && !pbProofDecide('watch')){
        if (pbDone) return;                 /* budget 切れ = inert 確定。tick も足さない */
        setTimeout(pbWatch, 500); return;   /* 既存 chain のみ */
      }
      var q = pbQuiesceObserve(Date.now());
      /* trace は最大 20 件なので、churn する page で末尾の停止理由を潰さないよう
         restart は **最初の 1 回だけ**記録する（回数は _pbState.quiesceRestarts で読む）。 */
      if (q === 'start' || q === 'lost' || (q === 'restart' && pbQuiesceRestarts === 1)) pbLog('quiesce/' + q);
      if (q === 'stable'){
        /* ★PHASE_B_MUST_NOT_REATTACH_UNLESS_PHASE_A_REGISTRY_COMPLETE:
           pbReattachOnce() の **直前・この瞬間**に registry をもう一度読む(latch 済みでも読む)。
           IIFE では読めない(fix553 idx 24 ＜ Phase A 4 file idx 56/65/267/268)。 */
        if (!pbProofDecide('pre-reattach')) return;   /* 不成立 = 再装着せず inert 確定 */
        /* ★T1 欠陥の修復点: 既に最外殻なら再 wrap せず、ここで latch して止まる。 */
        if (pbIAmOutermost()){ pbDone = true; pbLog('stop/already-outermost'); return; }
        pbReattachOnce();
        pbDone = true; pbLog('stop/reattached'); return;
      }
    } catch(e){}
    setTimeout(pbWatch, 500);
  }

  /* ★fix554(GPT指定): 生成単位ID。G.submit の入口で1つ増やすだけ(挙動は変えない)。
     3段階が「同じ生成のもの」かを見るために使う。 */
  function getG553(){
    try { if (window.G) return window.G; } catch(e){}
    try { if (typeof G !== 'undefined' && G) return G; } catch(e){}
    try { return (0,eval)('typeof G!=="undefined"?G:null'); } catch(e){ return null; }
  }
  function wrapSubmit(){
    try {
      var g = getG553();
      if (!g || typeof g.submit !== 'function' || g.submit.__f553) return !!(g && g.submit && g.submit.__f553);
      var prev = g.submit;
      var wrapped = function(){ if (!off()) genSeq++; return prev.apply(this, arguments); };
      wrapped.__f553 = true;
      try { Object.keys(prev).forEach(function(k){ if (k !== '__f553') wrapped[k] = prev[k]; }); } catch(e){}
      g.submit = wrapped;
      return true;
    } catch(e){ return false; }
  }

  /* ---- ③保存された本文をとる(ターン数の増加を見る) --------------------- */
  function getS(){ try { return window.__chronicleGetState('fix553'); } catch(e){ return null; } }
  var lastLen = -1;

  function poll(){
    if (off()) return;
    stats.polls++; stats.lastPollTs = Date.now();
    var st = getS(); if (!st || !Array.isArray(st.turns)) return;
    var n = st.turns.length;
    if (lastLen < 0){ lastLen = n; return; }
    if (n === lastLen) return;
    lastLen = n;
    stats.turns++;

    var t = st.turns[n - 1] || {};
    var s4 = metrics(t.narrative);
    /* ★生は「parsePlanと対になったもの」を使う。lastRaw をそのまま使うと会話ログの応答を掴む */
    var raw = pairedRaw || lastRaw;
    /* ★fix554(GPT指定): 長さが近いだけでは別の応答を偶然ペアにしうる。
       ①同じ生成単位(gen)であること ②20字以上の共通部分があること を確かめる。
       どちらか欠ければ **生を無かったことにして段階を断定しない**(前回値へフォールバックしない)。 */
    var pairOK = true;
    if (raw){
      var sameGen = (lastParsed && lastParsed.gen != null && raw.gen != null) ? (raw.gen === lastParsed.gen) : true;
      var fp = shareChunk(raw.body, (lastParsed && lastParsed.body) || t.narrative, 20);
      pairOK = sameGen && fp;
      if (!pairOK){ stats.capture.pairInvalid++; raw = null; }
    }
    var s1 = raw ? raw.metrics : null;
    var s2 = lastParsed ? lastParsed.metrics : null;
    if (!s1 || !s2) stats.capture.incomplete++;

    if (s1) stats.capture.raw++;
    if (usable(s1, s2 || s4)) stats.capture.rawUsable++;
    if (raw && raw.approx) stats.capture.rawApprox++;
    if (s2) stats.capture.parsed++;
    if (s4) stats.capture.saved++;
    if (s1 && s2 && s4) stats.capture.all3++;

    if (bad(s1) || bad(s2) || bad(s4)){
      var sample = '';
      try {
        /* ★fix560: 診断用の抜粋も metrics と同じ区切り規則で取る(段落ごとに正規化)。
           ここだけ旧規則のままだと、maxRun と抜粋の長さが食い違って読み手が混乱する。 */
        var worst = '';
        String(t.narrative || '').replace(/<[^>]*>/g, '').split('\n').forEach(function(line){
          normalizeSeparators(line).split(new RegExp(SPLIT.source, 'g')).forEach(function(p){
            if (p.trim().length > worst.length) worst = p.trim();
          });
        });
        sample = worst.slice(0, 120);
      } catch(e){}
      record({
        ts: new Date().toISOString(),
        turn: n - 1,
        stage: stageOf(s1, s2, s4),
        s1_raw: s1, s2_parsed: s2, s4_saved: s4,
        rawBodyLen: raw ? raw.bodyLen : null,
        rawApprox: raw ? !!raw.approx : null,
        rawPaired: !!pairedRaw,
        /* 生が後段と比べて短すぎないか(短ければ段階の断定に使っていない) */
        rawUsable: usable(s1, s2 || s4),
        pairOK: pairOK,
        gen: raw ? raw.gen : null,
        finish: raw ? raw.finish : null,
        model: (raw && raw.model) || (st.cfg && (st.cfg.orModel || st.cfg.model)) || null,
        outLen: (function(){ try { return lsg('v100_outputLen') || (st.cfg && st.cfg.outLen) || null; } catch(e){ return null; } })(),
        rawAgeMs: raw ? (Date.now() - raw.ts) : null,
        sample: sample
      });
    }
    lastRaw = null; lastParsed = null; pairedRaw = null;
  }

  /* ---- boot ----------------------------------------------------------- */
  function boot(){
    /* Planner は index.html の読み込み後に出来るので、出来るまで待つ(最大60秒) */
    (function tryParse(n){
      if (off()) return;
      wrapSubmit();
      if (wrapParse()) { try { console.log(TAG, 'parsePlan wrapped'); } catch(e){} }
      else if (n > 120) return;
      /* ★包めても止めない: 他のfixが包み直して外れることがあるので見張り続ける */
      setTimeout(function(){ tryParse(n + 1); }, n > 120 ? 5000 : 500);
    })(0);
    setInterval(poll, 3000);
    /* ★Q119 Phase B: opt-in のときだけ監視ループを起動する。OFF ならタイマーも 1 本も増えない。 */
    if (PB) setTimeout(pbWatch, 500);
    try { console.log(TAG, 'ready (読み取り専用・本文は書き換えない)'); } catch(e){}
  }

  window.__v292Dfix553 = {
    metrics: metrics,
    dump: function(){ return read(); },
    stats: function(){
      return { turns: stats.turns, flagged: stats.flagged, byStage: stats.byStage, logged: read().length,
               /* ★3段階が揃った件数(all3)が「見張りが生きている」証明。異常0件はそれ単体では証明にならない */
               capture: stats.capture,
               /* ★見張りの生死。polls が増えない = 検出器が死んでいる(記録0の意味が変わる) */
               polls: stats.polls,
               sincePollSec: stats.lastPollTs ? Math.round((Date.now() - stats.lastPollTs) / 1000) : null,
               alive: !!stats.lastPollTs && (Date.now() - stats.lastPollTs) < 120000,
               /* ★印(__f553)の有無ではなく「実際に捕捉した回数」で見る。
                  他のfixが包み直すと印は消えるが、こちらのラッパは鎖の中で生きている。 */
               genSeq: genSeq,
               wired: { fetch: installed, submit: !!(function(){ try { var g = getG553(); return g && g.submit && g.submit.__f553; } catch(e){ return false; } })(),
                        parsePlanCaptures: parsedCaptures,
                        parsePlanMarked: !!(function(){ try { var P = window.Planner; return P && P.parsePlan && P.parsePlan.__f553; } catch(e){ return false; } })() } };
    },
    clear: function(){ try { localStorage.removeItem(LOG); } catch(e){} return true; },
    off: off,
    _wrapFetch: wrapFetch, _wrapParse: wrapParse, _wrapSubmit: wrapSubmit, _poll: poll,
    _narrativeFromRaw: narrativeFromRaw, _kindOf: kindOf, _shareChunk: shareChunk,
    _peekPair: function(){ return { paired: !!pairedRaw, pairedLen: pairedRaw ? pairedRaw.bodyLen : null }; },
    /* ★Q119 Phase B の自己申告(DIAGNOSTIC ONLY・読み取り専用)。
       stats() の公開形は 1 field も変えていない。既存の _peek / _peekPair と同じ「_ 接頭辞 = 診断面」。
       pairedBody / parsedBody は「捕捉した生」と「捕捉した最終 plan」の対応を外から確かめるためだけに出す。 */
    /* ★本 lineage の追加読み出し(DIAGNOSTIC ONLY・読み取り専用・production 値は 1 つも変えない) */
    _pbProof: function(){ return pbPhaseAProof(); },   /* いま評価したらどうなるか(副作用なし) */
    _pbState: function(){
      return { on: pbLive,                 /* ★いま Phase B 意味論が生きているか(= 実効値) */
               intent: PB,                 /* ★DECLARED_INTENT(IIFE 1 回読み・以後不変) */
               proof: pbProof.proof, proofKeys: pbProof.keys.slice(),
               proofExtraKeys: (pbProof.extra || []).slice(),
               proofDecidedAt: pbProof.decidedAt, proofTries: pbProof.tries,
               proofFinal: pbProof.final, proofAt: pbProof.at, proofOK: pbProofOK,
               proofGraceTicks: PB_PROOF_GRACE_TICKS,
               proofRegKeys: PB_REG_KEYS.slice(),
               seq: pbSeq, activeId: pbActiveId, layers: pbMyFns.length,
               reattached: pbReattached, reattachCalls: pbReattachCalls,
               watcherDone: pbDone, watchTicks: pbWatchTicks,
               /* ★q119b5: fix277 marker は **診断情報へ降格**（authority ではない）。
                  field 名は q119b4 と同じまま残す（live の読み出し手順を変えないため）。 */
               f277Quiescent: pbF277Quiescent(), iAmOutermost: pbIAmOutermost(),
               quiesceMarginMs: PB_QUIESCE_MARGIN_MS,
               /* ★q119b5 の追加 field（4 つだけ・すべて読み取り専用の診断）。
                  quiesceAuthority : live で q119b4 と q119b5 を 1 目で区別するため
                  quiesceRestarts  : margin 内に何回代入が続いたか（既存 field では表せない）
                  watchBudget      : 有効な hard budget の値（定数の live 確認用）
                  budgetExhausted  : budget 切れで止まったのか（stop 理由は trace だけだと 20 件で溢れる） */
               quiesceAuthority: 'parsePlan-reference-stability',
               quiesceRestarts: pbQuiesceRestarts,
               watchBudget: PB_WATCH_MAX_TICKS, budgetExhausted: pbBudgetOut,
               trace: pbTrace.slice(),
               pairedBody: pairedRaw ? pairedRaw.body : null,
               pairedLen: pairedRaw ? pairedRaw.bodyLen : null,
               parsedBody: lastParsed ? lastParsed.body : null };
    },
    _peek: function(){ return { hasRaw: !!lastRaw, hasParsed: !!lastParsed, lastLen: lastLen }; }
  };

  /* ★fetch のラップだけは「今すぐ・同期で」やる。DOMContentLoaded まで待つと、
     その間に読み込まれる他のfetchラッパより外側になってしまい、生出力が取れなくなる。 */
  if (!off()) wrapFetch();

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
