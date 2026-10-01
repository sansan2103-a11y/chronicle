// =====================================================================
// Chronicle TRPG - v292Dfix277: 準登録カルテ + 帰属品質パック (fix277 / 277b / 278)
// 設計: 設計_準登録カルテと帰属品質パック_fix276-279.md (おしん承認 2026-06-12)
// ---------------------------------------------------------------------
// fix277 (準登録カルテ・本丸):
//   未登録キャラが累計3ターン登場(say/react/stateタグのwho + 会話ログwho)したら
//   自動で「準登録」化。新エンジンsysの【各キャラの現在の状態】を後処理し、
//   ・キャストの状態行 = 従来通り無加工
//   ・準登録(直近5ターンに登場)の状態行 = 1人120字に圧縮して保持・合計600字で
//     最終登場が古い順に切る(sys肥大ガード=注入は窓で絞る鉄則)
//   ・それ以外のキャスト外状態行 = 除去(fix77ストアは誰のwhoでも収穫するため、
//     これまでは一度入った未登録キャラの状態が無期限でsysに居座っていた)
//   ・準登録名を列挙し「<say who>/<state who>を必ず出す」許可行を1行追加
//     (モデルが準登録の状態タグを出す→fix77が収穫→カルテが回り出す)
//   保存: localStorage 'v292Dfix277Quasi'+スロット接尾辞 = 物語データと別キー(消しても無傷)
//   OFF: localStorage v292QuasiCastOff='1'
// fix277b (別名の機械可読化):
//   キャラ説明文の「別名: A, B」行をパースし A/B→正名 に名寄せ。
//   ・fix77状態収穫の正規化(別名エントリを正名へマージ)
//   ・会話ログカードの who 正規化(index.html側がwindow.__v292AliasFixを呼ぶ)
//   ・キャラ一覧の別名カードを非表示(表示統合のみ・データは残す)
//   OFF: localStorage v292AliasOff='1'
// fix278 (キャラ一覧アイコンの会話ログ統一):
//   fix145カードのアイコンを、まず会話ログと同じ v292av2_ キャッシュ
//   (fix197 keyFor=名前+画風)から適用。キャッシュ未生成時のみ従来経路。
//   OFF: localStorage v292IconUnifyOff='1'
// ---------------------------------------------------------------------
// ★FIX277_LOCAL_CASE_NORMALIZED_ANALYSIS_VIEW v2 / CASE_VIEW γ  (②C1 裁定 EI SO-2)
//   FEATURE  : FIX277_LOCAL_CASE_NORMALIZED_ANALYSIS_VIEW
//   VERSION  : FIX277_LOCAL_CASE_NORMALIZED_ANALYSIS_VIEW/v2 (2026-09-12)
//   設計     : gold/Q119_S4_FINAL_ACTIVATION_DESIGN_v1.md §2 / §6
//              （v1 = gold/FIX277_LOCAL_CASE_NORMALIZED_ANALYSIS_VIEW_DESIGN_v1.md）
//   lineage  : candidate/q119s4/。candidate/f277cv/ は R5′ の戻し先実体として凍結保存（置き換えない）。
//   ★CASE_VIEW = case-order 互換層（case-order compatibility layer）
//     Phase A が実効な page では **常に実効**であり、Phase A が OFF の page では **常に OFF** である（γ）。
//     CASE_VIEW は protocol を決めない。
//       ・「say/state タグは小文字が正」という裁定ではない。
//       ・大文字タグが文法違反かモデル逸脈かを 1 つも決めていない。
//     CASE_VIEW が除去するのは **wrapper 年齢依存（wrapper-age dependency）だけ** である。
//   ★TAG_CASE_SEMANTICS = STILL UNRESOLVED（S4 でも解決しない・維持）
//   ★DEFAULT ON（γ）
//     CASE_VIEW 実効 = CASE_VIEW_PHASE_A（load 時 1 回・Phase A と同一の kill key）
//                      ∧ localStorage['v292Dfix277CaseViewOff'] !== '1'（per-call）
//     kill(Phase A)   = localStorage['v292DQ119PageCanaryOff'] === '1'
//                       → Phase A と CASE_VIEW が **reload で同時に** OFF（R1′ = 論理 rollback）
//     kill(CASE_VIEW) = localStorage['v292Dfix277CaseViewOff'] === '1'
//                       → CASE_VIEW だけ OFF（Phase A は ON = F6b 状態・設計 §2-4 で受理）
//     storage read が throw → OFF（FAIL TO PRODUCTION・Phase A と対）
//     slot opt-in（v292Dfix277CaseViewOn_slot_<slotId>）と global opt-in（v292Dfix277CaseViewOn）は
//       ★**読まない**（S4 で廃止。立てても消しても何も起きない）。cvSlotId() も削除した。
//   ★契約名
//     CASE_VIEW_TRACKS_PHASE_A_AT_LOAD_ONLY : Phase A kill による CASE_VIEW の反転は reload 時のみ。
//                                             走行中に立てても当該 page では効かない。
//     CASE_VIEW_OWN_KILL_STAYS_PER_CALL     : CASE_VIEW 単独の kill は従来どおり **次の parse から即**効く（reload 不要）。
//   ★SHARES ONLY THE KILL FLAG NAME WITH PHASE A（flag-name coupling のみ）
//     fix78 の関数も window.__v292Dfix78Normalize も registry（__v292WrapReg）も window property も
//     **一切参照しない**。NO RUNTIME COUPLING TO fix78 / fix74 / fix645 / fix648。
//     読むのは localStorage だけなので load 順依存 0（fix277 は idx 88 で fix645/648 より先に走る）。
//     caseViewForAnalysis は fix78 L22-27 と同一意味論の file-local copy(window へ公開しない)。
//   ★CASE_VIEW = LOCAL ANALYSIS ONLY / RAW IMMUTABLE（v1 から 1 文字も変えていない）
//     ・view は harvestRaw / detectSelfNaming の **関数内ローカル変数 txt** にしか存在しない。
//     ・parsePlan の第1引数 rawText は書き換えない(inner(rawText, inputType) は原文のまま)。
//     ・戻り値 plan に触れない。view 文字列を localStorage / prompt / ログへ書かない。
//     ・正規化するのは say/state の **タグ名のみ**(開き + 閉じ)。属性名・属性値・本文・
//       react/scene_move/voice/summary は 1 文字も変えない。
//   適用点   : harvestRaw 冒頭 / detectSelfNaming 冒頭 の 2 か所のみ（v1 から byte 逐語不変）
//              (production 行番号で R1 :446 / R2 :448 / R3 :490 の 3 read site を全被覆)
//   不変条件 : installParse/wrapParse のロジック変更 0 / 新しい timer・watchdog 0 / 新しい wrapper 層 0 /
//              Phase A 「1 parse = 1 execution」不変 / Phase B raw→final plan pairing 不変。
//   production status: **PRODUCTION ACTIVATION HOLD**（本 file は offline candidate。deploy は Owner gate + ②C1 裁定）
// ---------------------------------------------------------------------
// ★HOT_LOG_SLOT_ATTRIBUTION v1.1 (FIX537_HOT_LOG_NOT_SLOT_SCOPED の修正 / ②C1 裁定 EN-4 ・ EO-3 ・ **EP**)
//   FEATURE  : HOT_LOG_SLOT_ATTRIBUTION
//   VERSION  : HOT_LOG_SLOT_ATTRIBUTION/v1.1 (2026-09-12)
//   v1 からの差分 : **UNIQUE-ATTRIBUTION FIX**（②C1 裁定 EP）。
//     v1 は「現在 slot の台帳で P2 ∧ P3 が証明できたら attribute」だったが、
//     同じ (alias, canonical, turn) が **2 つ以上の slot 台帳** で成立すると
//     「一致した」ことだけで attribute してしまう（= 実質的な推測）。
//     v1.1 は **「一意にしか一致しない」** を要求する: 全 slot の slot-scoped evidence（各 slot の台帳）を
//     照合し、P2 ∧ P3 を満たす候補 slot が **exactly 1 件** のときだけ attribute する。
//       候補 0 件   → UNKNOWN_SLOT（reason = ledger-no-candidate）
//       候補 2 件以上 → UNKNOWN_SLOT（reason = ledger-ambiguous-multi）
//     ★AMBIGUOUS_SLOT というデータ区分は **作らない**。区別は diagnostic reason だけで行い、
//       データ分類としては UNKNOWN_SLOT に集約する（UNKNOWN は positive evidence にならない）。
//   設計     : gold/FIX537_HOT_LOG_SLOT_SCOPE_DESIGN_v1.md（ACCEPTED_DESIGN）§4 （採用 = A2 entry stamp + 3.B(i) fix277 内）
//   lineage  : candidate/f537hs/。patch base = 現 live fix277 = candidate/q119s4/ (c3a94d64… / 64,214 B)。
//   目的     : 固定 key 'v292Dfix537_log' に全 story の edge が混ざる（S-1 CROSS_STORY_MIXING）と、
//              slot 権威が無い document でも hot log だけは書かれる（S-2 NO_SLOT_AUTHORITY_GATE）を直す。
//   ★契約 (AUDIT EVIDENCE ONLY — archive v1 と同一):
//     この hot log は **同一性の権威ではない**。
//       ・fix845 の persisted judgment に使ってはならない
//       ・XLE evaluator の STRONG edge 判定に使ってはならない
//       ・canonicalize / merge / alias 昇格 / identity promotion に使ってはならない
//     production の reader は **0 本**（本 fix でも追加しない）。
//   ★WRITE 契約 (EN-4 逐語):
//     authoritative current slot（slotSfx()、= fix783 __chronicleDocumentStoryKey 権威）があるときだけ、
//     entry の **末尾** に slot stamp field `s` を付けて保存する。slot が無ければ hot log を **書かない**（S-2 gate）。
//     既存 4 field {ts,turn,alias,canonical} は名前・型・順序とも不変。key も cap 30 も FIFO(slice(-30)) も不変。
//   ★READ 契約 (②C1 裁定 EP で正本の表現を狭めた):
//     **ACTIVE_PRODUCTION_RUNTIME_CONSUMERS_INSIDE_FIX277 = SLOT_SCOPED**
//       ← これが本 candidate が保証する契約であり、ALL_HOT_LOG_CONSUMERS では **ない**。
//     すなわち fix277 内の **現行 production runtime consumer** はすべて
//     `entry.s === current slot`（または一意に証明できた legacy entry）だけを入力にする。
//     fix277 内の read site は 2 つしかない:
//       (R-a) detectSelfNaming の read-modify-write（= 永続化のための read。consumer ではない。
//             他 slot / stamp 無し entry を **1 バイトも書き換えず、削らず**に保存する）
//       (R-b) hlsRead()（= 唯一の正規 consumer 経路。current / foreign / unknown を分け、
//             `s === 現在 slot` のものだけを current として返す）
//     fix277 外の reader（設計 §1.4 の 12 本）は **本 candidate では規制外 = F537HS_READER_MIGRATION lane**。
//       → gold/FIX537_HOT_LOG_SLOT_SCOPE_OFFLINE_IMPLEMENTATION_v1.md §4 に行番号付きで一覧を残してある。
//       ★fix845 を ON にする前の activation checklist に
//         「HOT_LOG reader must require entry.s === currentSlot」を **必須条件** として追記する（同 §12）。
//   ★UNKNOWN_SLOT:
//     stamp 無し entry・他 slot entry は **証拠として保存するが**、current story の入力・判断には絶対に使わない。
//     migration は **推測禁止**。既存の slot-scoped evidence（各 slot の台帳 v292Dfix277Quasi<sfx>）を
//     **全 slot 分照合**し、以下をすべて満たすときだけ attribute する:
//       (P1) 現在 slot に権威がある（slotSfx() !== null）
//       (P2) store[canonical].ali に alias が含まれる
//       (P3) entry.turn が store[canonical].seen に実在する（= 同一 event の turn が台帳側にもある）
//       (P4) ★**P2 ∧ P3 を満たす候補 slot が全 slot 中で exactly 1 件**（UNIQUE ATTRIBUTION / ②C1 EP）
//     候補 0 件も 2 件以上も UNKNOWN_SLOT。「一致した」ではなく「一意にしか一致しない」を要求する。
//   既定     : **DEFAULT OFF**。opt-in = localStorage v292Dfix537SlotLogOn='1'
//              kill   = localStorage v292Dfix537SlotLogOff='1'（opt-in より **優先**）
//              storage read が throw → OFF（FAIL TO PRODUCTION）。off537 / offQ の全停止はこれらより **上位**。
//   容量（実測で更新。設計 §6.1 の見積りを置き換える）:
//     stamp `s` = slotSfx() 逐語（'_slot_' 込み）なので 1 entry あたり **≈ +22 B**。
//     cap 30 で **≈ 660 B**（live の slot id 長 10-11 字なら +23 B/entry = **700 B 弱**で頭打ち）。
//     設計 §6.1 の「短形 +13 B / 30 件で +390〜600 B」は裸の slot id を前提にしていたため不正確。
//     ★fix543 LOW_WATER（204,800 B）比は **参考値**としてのみ扱い、受入条件にしない。
//   不変条件 :
//     ・OFF のとき hot log の 3 行は production と **逐語同一** （書込内容・順序・cap 30・key すべて不変）
//     ・検出意味論（detectSelfNaming の成立条件 4 つ）と ali 台帳への書込みを 1 行も変えない
//     ・新しい永続 key を **1 本も作らない**（counter は in-memory + window 公開 API のみ）
//     ・Planner.parsePlan を **新たに包まない**（new parsePlan wrapper 0 / wrap chain に層を足さない）
//     ・fix553 / Q119 registry / Phase B / q119b4 / fix844 / fix845 の key を read も write もしない
//     ・archive（f537arc = 'v292Dfix537_logArc'+slotSfx()）に依存しない・触らない
//     ・log 書込みは try/catch 完全内包。quota 失敗は in-memory counter を上げるだけで検出へ伝播しない
//   production status: **PRODUCTION HOLD**（F537HS_STAGE1_v1.1 = OFFLINE_CANDIDATE / DEFAULT OFF。deploy は Owner gate + ②C1 裁定）
// ---------------------------------------------------------------------
// 可逆性: 全コンポーネント個別OFFフラグ + データは別キー保存 = ダメなら戻せる。
// =====================================================================
(function(){
  'use strict';
  var TAG = '[v292Dfix277:quasi-pack]';
  if (window.__v292Dfix277Pack) return;
  window.__v292Dfix277Pack = true;

  /* ★fix539(2026-07-25・GPT監査P0): S の取得は index.html が提供する正式APIを第一経路にする。
     背景: 間接eval 頼みの取得が実機で無言のまま null を返し、判定が丸ごと空振りした
     (実測: normalizeConvWho が 0 件。詳細は index.html の fix539 コメント)。
     fix538b の「一度取れた S を覚える」永続キャッシュは、別スロットの S を握り続ける危険があるため撤去。
     以降の3経路は index.html が古いキャッシュのときだけ使う移行期の後方互換。 */
  function note539(feature, reason, err){
    try { if (window.__chronicleState && typeof window.__chronicleState.note === 'function')
            window.__chronicleState.note(feature, reason, err); } catch(e){}
  }
  function getS(){
    var g = null;
    try { g = window.__chronicleGetState; } catch(e){}
    if (typeof g === 'function'){
      try { var a = g('fix277'); if (a) return a; } catch(e){ note539('fix277', 'getter-threw', e); }
    } else { note539('fix277', 'getter-missing'); }
    /* ここから下は index.html が fix539 より古いキャッシュのときだけ通る移行期の後方互換。
       ★fix539b(GPT裁定): 正式APIが失敗したのにフォールバックが救えた場合は必ず記録する
       (「getterは失敗するのに旧経路は成功する」が再捕獲できれば機序特定の決定打になる)。 */
    /* ★fix539c: window.S を lexical S より先に見る。理由は2つ:
         (1) GPTが示した統一形もこの順序。(2) **読取専用フォレンジックの土台**。
         配信JSを new Function へ流してモックwindowを渡す検証手法では、bare S は
         **本物のページの const S へ解決してしまう**(実測: モック7ターンのはずが本物38ターンを返した)。
         window.S を先に見れば、モックを渡した時にモックが勝つ。本番では window.S は
         undefined なので、この順序変更で本番の挙動は変わらない。 */
    try { if (window.S){ note539('fix277', 'rescued-by-window'); return window.S; } } catch(e){}
    try { if (typeof S !== 'undefined' && S){ note539('fix277', 'rescued-by-lexical'); return S; } } catch(e){}
    try { var u = (0,eval)('typeof S!=="undefined"?S:null');
          if (u){ note539('fix277', 'rescued-by-eval'); return u; }
          note539('fix277', 'legacy-eval-null'); }
    catch(e){ note539('fix277', 'legacy-eval-threw', e); }
    return null;
  }
  function offQ(){ try { return localStorage.getItem('v292QuasiCastOff') === '1'; } catch(e){ return false; } }
  function offA(){ try { return localStorage.getItem('v292AliasOff') === '1'; } catch(e){ return false; } }
  function offI(){ try { return localStorage.getItem('v292IconUnifyOff') === '1'; } catch(e){ return false; } }

  // ---- スロット接尾辞(fix246と同ロジック・ただし自前キーなので自前で付ける) ----
  /* ■fix783(2026-09-01) MULTI_TAB_CROSS_STORY_CFG_CONTAMINATION
     真因: 共有ポインタ chr6_active_slot(= __chr6Key()) は**全タブで1個**。別タブが物語を
       開いた瞬間このタブの key 解決が相手の story を指し、準登場人物パック v292Dfix277Quasi<sfx> が
       別 story へ着弾/汚染された(実測: ct_fix783_multitab.mjs R群)。
     対処: key 解決を fix694 document authority(__chronicleDocumentStoryKey)へ固定する
       (fix307f と同じ作法)。authority 無し document(home 等)では null=**読まない/書かない**。
     kill: localStorage v292Dfix783Off='1' → 全ファイル同時に旧 __chr6Key() 挙動へ戻る。 */
  function f783Off(){ try{ return localStorage.getItem('v292Dfix783Off')==='1'; }catch(e){ return false; } }
  function slotSfx(){
    if(!f783Off()){
      try { var dk = window.__chronicleDocumentStoryKey;
            if (typeof dk === 'string' && dk) return (dk === 'chr6') ? '' : dk.replace(/^chr6/, ''); } catch(e){}
      return null;                                   /* authority 無し = 触らない */
    }
    try {
      if (typeof window.__chr6Key === 'function'){
        var k = window.__chr6Key();
        return (k && k !== 'chr6') ? k.replace(/^chr6/, '') : '';
      }
    } catch(e){}
    return '';
  }
  function QK(){ var s = slotSfx(); return (s === null) ? null : ('v292Dfix277Quasi' + s); }

  /* ★FIX277_LOCAL_CASE_NORMALIZED_ANALYSIS_VIEW v2 (②C1 裁定 EI SO-2 / 詳細は本 file 冒頭の header)
     RAW IMMUTABLE: ここにあるのは fix277 自身の **解析用コピー** を作る純関数と旗だけであり、
     parsePlan の引数・戻り値・保存内容を 1 バイトも変えない。 */
  /* Q119-S4 γ: Phase A と同一の kill key を **load 時 1 回**だけ読む（両者は reload でしか同時反転しない）。 */
  function cvPhaseARead(){
    try { return localStorage.getItem('v292DQ119PageCanaryOff') !== '1'; } catch(e){ return false; }
  }
  var CASE_VIEW_PHASE_A = cvPhaseARead();       /* page-lifetime constant */
  /* CASE_VIEW 実効 = Phase A 実効（load 時定数） ∧ 自 kill が立っていない（per-call・既存契約 R3 を保存） */
  function caseViewOn(){
    if (!CASE_VIEW_PHASE_A) return false;
    try { return localStorage.getItem('v292Dfix277CaseViewOff') !== '1'; } catch(e){ return false; }
  }
  /* fix78 L22-27 と同一意味論の file-local copy。fix78 を一切参照しないし window へも公開しない。
     say/state のタグ名のみ小文字化(開き/閉じ両方・\b で終端)。副作用無しの純関数。 */
  function caseViewForAnalysis(s){
    if (typeof s !== 'string') return s;
    return s.replace(/<(\/?)(say|state)\b/gi, function(m, slash, tag){
      return '<' + slash + tag.toLowerCase();
    });
  }

  var qStore = null, qKeyLoaded = '';
  function loadQ(){
    var k = QK();
    /* ■fix783: 権限が無い document は台帳を読まない（メモリ上の空台帳として振る舞う。返り値の型は不変） */
    if (k === null){ if (qKeyLoaded !== null){ qStore = {}; qKeyLoaded = null; } return qStore; }
    if (qStore && qKeyLoaded === k) return qStore;
    try { qStore = JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch(e){ qStore = {}; }
    qKeyLoaded = k;
    return qStore;
  }
  var qDirty = false;
  /* ★★fix748(Phase C / C15 = Class C): fix277 は 2 つのキーを書く。
       ・v292Dfix277Quasi<sfx>（準登録台帳） … saveQ()
       ・v292Dfix77States<sfx>（別名→正名マージ結果） … mergeAliasStates()
     この 2 つは **同じ logical transaction**（companion key）なので、
     lock の外へ片方だけ出さない。実際の主経路は Planner.build wrapper
     （= turn pipeline の TURN_BUILD admission の内側）と _parseExtensions（TURN_PARSE の内側）。

     RECOMPUTATION_SOURCE  = qStore（メモリ上の準登録台帳。qDirty が立ったまま残る）
                             + aliasMap()（台帳から導出）→ fix77 store への再マージは純関数的
     RECOMPUTATION_TRIGGER = 次の Planner.build（毎ターン必ず走る。syncConv → mergeAliasStates → saveQ）
     ＝ skip しても qDirty は false にしないので、次ターンの build で同じ内容が必ず書かれる。 */
  (function(){
    try {
      var A = window.__v292DfixDAdm;
      if (A && typeof A.registerC === 'function'){
        A.registerC('fix277.saveQ',
          'qStore（メモリ上の準登録台帳。skip 時は qDirty を落とさない）',
          '次の Planner.build（毎ターン。syncConv → mergeAliasStates → saveQ）',
          'C15 quasi ledger');
        A.registerC('fix277.mergeAliasStates',
          'aliasMap()（準登録台帳から導出）+ __v292Dfix77Store。再マージは純関数的',
          '次の Planner.build（毎ターン）',
          'C15 alias merge / companion of fix277.saveQ');
      }
    } catch(e){}
  })();
  /* ★裁定11 GATE1: admission 外でも **実際に lock を取りに行く**。BUSY のときだけ飛ばす。 */
  function f748PersistC(who, fn){
    try {
      var A = window.__v292DfixDAdm;
      if (!A || typeof A.persistC !== 'function'){ fn(); return { wrote:1, legacy:true }; }
      return A.persistC(who, fn);
    } catch(e){ try { fn(); } catch(_){} return { wrote:1, legacy:true }; }
  }
  function saveQ(){
    if (!qDirty || !qStore) return;
    /* ★qDirty は書けたときにだけ落とす。飛ばされた場合は次の build で必ずもう一度書く。 */
    return f748PersistC('fix277.saveQ', function(){
      try { var _qk = qKeyLoaded || QK(); if (!_qk) return; localStorage.setItem(_qk, JSON.stringify(qStore)); qDirty = false; } catch(e){}
    });
  }

  // ---- キャスト ----
  function castNames(){
    var out = [];
    try {
      var S = getS(); if (!S || !S.cast) return out;
      if (S.cast.hero && S.cast.hero.name) out.push(String(S.cast.hero.name));
      (S.cast.npcs || []).forEach(function(n){ if (n && n.name) out.push(String(n.name)); });
    } catch(e){}
    return out;
  }

  // ---- fix277b: 別名マップ(キャラ説明の「別名: A, B」行) ----
  var aliasCache = null, aliasAt = 0;
  function aliasMap(){
    if (offA()) return {};
    var now = Date.now();
    if (aliasCache && (now - aliasAt) < 5000) return aliasCache;
    var map = {};
    try {
      var S = getS();
      var people = [];
      if (S && S.cast){
        if (S.cast.hero && S.cast.hero.name) people.push(S.cast.hero);
        (S.cast.npcs || []).forEach(function(n){ if (n && n.name) people.push(n); });
      }
      people.forEach(function(p){
        var d = String(p.desc || p.description || '');
        var m = d.match(/(^|\n)[\s　]*別名[:：]([^\n]+)/);
        if (!m) return;
        m[2].split(/[、,，・\/／]/).forEach(function(a){
          a = String(a).trim();
          if (a && a !== p.name && a.length <= 12) map[a] = String(p.name);
        });
      });
      // 準登録エントリの手動別名(コンソール __v292QuasiPack.addAlias 用)
      var qs = loadQ();
      Object.keys(qs).forEach(function(n){
        ((qs[n] && qs[n].ali) || []).forEach(function(a){ if (a && a !== n) map[a] = n; });
      });
    } catch(e){}
    /* ★fix540(2026-07-25・実セーブ12物語のフォレンジックで捕獲): 別名台帳の**壊れた向き**を遮断する。
       実測(離島17T `smrisv41ho7`): 台帳に `涼太.ali=["霧 涼太"]` と `霧 涼太.ali=["涼太"]` の
       **相互別名(循環)**が入っていた。しかも `霧 涼太` は**この物語の主人公(登録キャスト)**。
       これが起こす実害(いずれも実測・未適用):
         (a) unifyCards: 互いに相手の正名カードが在るので、**主人公のカードも相手のカードも消える**
         (b) normalizeConvWho: 同じ1回で 霧 涼太→涼太 を36件、涼太→霧 涼太 を7件 = **総入れ替え**。
             しかも冪等でない(次に走らせるとまた入れ替わる)
         (c) noteAppear: aliasFix で主人公が `涼太` に化け、**主人公が準登録カルテに登録される**
       規則(2段・この順):
         A. **登録キャスト名は別名側に立てない**(キャスト名は常に正名)。fix537の成立条件(4)と同じ原則。
         B. Aの適用後もなお相互参照が残るものは**循環として両方落とす**(fail-closed)。
       12物語の実測での影響範囲: **離島17T の1件だけ**。他6物語にある「連鎖」(白いワンピースの少女→少女→シオン等)は
       **一切触らない**(連鎖の解決は別問題として保留・GPTと相談する)。
       OFF: localStorage v292Dfix540Off='1' / 記録: window.__v292Dfix540.dropped() */
    if (!off540()){
      try {
        var cast540 = castNames();
        Object.keys(map).forEach(function(a){
          if (cast540.indexOf(a) >= 0){ drop540(a, map[a], 'cast-is-canonical'); delete map[a]; }
        });
        /* 循環判定は**削除前のスナップショット**で行う(片方を先に消すと、もう片方が
           「循環でない」ように見えて生き残り、どちらが残るかがキー順に依存してしまう) */
        var snap = {}; Object.keys(map).forEach(function(a){ snap[a] = map[a]; });
        Object.keys(snap).forEach(function(a){
          if (snap[snap[a]] === a){ drop540(a, snap[a], 'cycle'); delete map[a]; }
        });
      } catch(e){}
    }
    aliasCache = map; aliasAt = now;
    return map;
  }
  function off540(){ try { return localStorage.getItem('v292Dfix540Off') === '1'; } catch(e){ return false; } }
  var _dropped540 = [];
  function drop540(from, to, why){
    try {
      var k = from + '>' + to + ':' + why;
      for (var i=0;i<_dropped540.length;i++){ if (_dropped540[i].k === k) return; }
      _dropped540.push({ k: k, from: from, to: to, why: why });
      while (_dropped540.length > 20) _dropped540.shift();
      console.warn(TAG, 'fix540: 壊れた別名を無効化', from, '->', to, '(' + why + ')');
    } catch(e){}
  }
  window.__v292Dfix540 = { dropped: function(){ return _dropped540.slice(); }, off: off540 };
  function aliasFix(name){
    try { if (offA()) return name; var m = aliasMap(); return m[name] || name; } catch(e){ return name; }
  }
  window.__v292AliasFix = aliasFix; // index.html(会話ログ収穫)から呼ばれる

  // ---- fix277b: fix77状態ストアの別名エントリを正名へマージ ----
  function mergeAliasStates(){
    if (offA()) return;
    try {
      var st = window.__v292Dfix77Store; if (!st) return;
      var map = aliasMap(); var moved = 0;
      Object.keys(map).forEach(function(a){
        if (!st[a]) return;
        var c = map[a];
        var src = st[a], dst = st[c] || {};
        var newer = (src.turn || 0) >= (dst.turn || 0);
        ['karada','kokoro','honno','mokuteki','kizu','kankei','mikaiketsu','turn'].forEach(function(k){
          if (src[k] != null && (newer || dst[k] == null)) dst[k] = src[k];
        });
        st[c] = dst; delete st[a]; moved++;
      });
      if (moved){
        /* ★fix748(C15): admission 外ならこの 1 回の persist を飛ばす。
           メモリ側のマージ結果は残るので、次の Planner.build 時に
           （まだ別名が残っていればもう一度マージされ）必ず書かれる。 */
        f748PersistC('fix277.mergeAliasStates', function(){
          try { localStorage.setItem('v292Dfix77States', JSON.stringify(st)); } catch(e){} /* fix246がスロット接尾辞へ自動リダイレクト */
          try { console.log(TAG, '別名状態を正名へマージ:', moved, '件'); } catch(e){}
        });
      }
    } catch(e){}
  }

  // ---- fix277: 登場の記帳 ----
  var BAD = /^(それ|これ|あれ|どれ|誰か|何か|彼|彼女|自分|皆|みんな|全員|二人|三人|私|俺|僕|お前|あなた|主人公|名前|不明|\?+|？+)$/;
  /* ★fix528a(2026-07-25): 文の断片が人物名として台帳登録されるのを止める。
     実測(おしんの実セーブ smrg85jwsn6): 準登録カルテに「鏡の奥から」が1件登録されていた。
     これは人物名ではなく地の文の断片で、モデルが who 属性に句を書いた時に validName を通ってしまう。
     対策: 多字の格助詞で終わる呼称だけを弾く。「から/まで/より/へと」は日本語の人名の語尾として
     事実上使われないため、実在の人名を巻き込まない(★1字の「と」「の」等はハルト/ヤマト等を巻き込むので対象外)。
     OFF: localStorage v292Dfix528Off='1' */
  var FRAGMENT_TAIL = /(から|まで|より|へと)$/;
  /* ★fix536a(2026-07-25・30ターン実機で捕獲): プレースホルダ表記を人物として登録しない。
     実測: 30ターン走行後の準登録カルテに **「主人公（仮）」** が1件入り、fix77状態ストアにも
     空の状態エントリが作られていた(モデルが who="主人公（仮）" と書いた)。
     BAD は「主人公」の完全一致しか見ておらず、括弧つきの仮ラベルが素通りしていた。
     対策: 括弧を含む呼称と、仮ラベル語を弾く。実在の人名に括弧は使われないため巻き込みは無い。 */
  var PLACEHOLDER = /[（）()]|^(仮|仮称|未設定|名前未設定|不明な声|名無し)$|(（仮）|\(仮\))/;
  function off528(){ try { return localStorage.getItem('v292Dfix528Off') === '1'; } catch(e){ return false; } }
  function validName(n){
    n = String(n || '').trim();
    if (n.length < 2 || n.length > 12) return '';
    if (/[\s　0-9０-９a-zA-Z。、！？!?…・「」『』<>="'\/\\]/.test(n)) return '';
    if (BAD.test(n)) return '';
    if (!off528() && FRAGMENT_TAIL.test(n)) return '';
    if (!off528() && PLACEHOLDER.test(n)) return '';   // ★fix536a
    return n;
  }
  /* ★fix528b(2026-07-25・実データ再現で確定): 登録キャラの「名だけ呼び」を別人物として台帳登録しない。
     真因: noteAppear のキャスト除外は完全一致のみ。姓名を空白/中黒で分けて登録した名前
       (例「霧 涼太」「大浦 源蔵」「アリア・リュミエール」)は、地の文・セリフでは名だけ(「涼太」)で
       書かれるため、その名だけが「未登録キャラ」として準登録カルテに入る。
       さらに準登録は sys に「これらの人物も登場中は<say who=名前>を必ず出す」と注入されるので、
       モデルへ分身の使用を促す正のフィードバックになっていた(=分身が消えない構造的理由)。
     実測: smrisv41ho7 で「涼太」が seen 8ターン・会話ログ7カードを占め、主人公「霧 涼太」と
       別アイコン・別状態カードに分裂していた(fix409cはデータ層の後始末、本fixは発生源の遮断)。
     判定は極めて保守的に: (1) キャスト名が空白または中黒を含む(=姓名を分けて登録している)場合だけ、
       (2) 区切りを除いた文字列の末尾に候補が完全一致し、(3) 残りの姓部分が1〜4字、(4) 候補が一意。
       → 「朝比奈ひなた」(区切り無し)の「ひなた」等は対象外にして巻き込みを避ける。
     OFF: localStorage v292Dfix528Off='1' */
  /* この物語の現在ターン数。0 は「まだ物語がメモリに載っていない」を意味するので判定に使わない。 */
  function storyTurnCount(){ try { var S = getS(); return (S && Array.isArray(S.turns)) ? S.turns.length : 0; } catch(e){ return 0; } }
  /* ★fix528d-b: その名前がこの物語の本文・入力・会話ログのどこかに現れるか。
     fix529(キャラ一覧)と同じ判定基準。「別物語からの混入」と「正当な巻き戻し」を区別する唯一の証拠。 */
  function appearsInStory(name){
    try {
      var S = getS(); if (!S || !Array.isArray(S.turns)) return false;
      for (var i = 0; i < S.turns.length; i++){
        var t = S.turns[i]; if (!t) continue;
        if (String(t.narrative || '').indexOf(name) >= 0) return true;
        if (String(t.playerText || '').indexOf(name) >= 0) return true;
        var cs = t._convSays;
        if (Array.isArray(cs)){
          for (var j = 0; j < cs.length; j++){
            var c = cs[j]; if (!c) continue;
            if (String(c.who || '').indexOf(name) >= 0) return true;
            if (String(c.say || '').indexOf(name) >= 0) return true;
          }
        }
      }
    } catch(e){}
    return false;
  }
  /* sf(suspended-future)を立てる。同時に「この物語の証拠にならない登場実績」を sfSeen へ退避する。
     ・本文に一度も出ない = 別物語からの混入 → seen を全部退避(この物語での実績はゼロが正しい)
     ・本文に出る        = 正当な巻き戻し等  → 存在しないターン番号だけ退避(実績は残す)
     どちらも削除ではなく退避。復帰は noteAppear の再観測だけが行う。 */
  function suspendFuture(e, name, cur){
    var foreign = !appearsInStory(name);
    var keep = [], drop = [];
    (e.seen || []).forEach(function(x){ (!foreign && x <= cur - 1 ? keep : drop).push(x); });
    if (drop.length) e.sfSeen = (e.sfSeen || []).concat(drop).slice(-60);
    e.seen = keep;
    e.last = keep.length ? Math.max.apply(Math, keep) : 0;
    e.sf = foreign ? 2 : 1;   // 2=別物語由来 / 1=巻き戻し等。どちらも再観測まで注入禁止
    try { console.log(TAG, 'fix528d: 注入停止(' + (foreign ? '別物語由来' : '未来ターン') + '):', name); } catch(_){}
  }
  /* ★fix830(2026-09-07・GPT 裁定 73/74 ENTITY_IDENTITY_DYNAMIC_REGISTRATION_V1):
       「この名前はすでに知っている人物か」を 1 か所で答える共有 resolver。
       自動 merge に使ってよいのは EXACT / ALIAS_EXACT / FOLDED_EXACT だけで、
       fix445 の前方後方一致（LEGACY_PARTIAL）は **使わない**（「少女」と「観覧車の少女」を同一人物にしない）。
       fix830 不在 / v292Dfix830Off / v292Dfix764Off のときは '' を返す＝このファイルは従来どおり動く。 */
  function f830AutoMatch(name, names){
    try {
      var f = window.__v292Dfix830;
      if (!f || typeof f.autoMatch !== 'function') return '';
      return f.autoMatch(name, names, { noPartial: true }) || '';
    } catch(e){ return ''; }
  }

  function castPartOwner(name){
    try {
      var cs = castNames(), hit = null, n2;
      for (var i = 0; i < cs.length; i++){
        var c = String(cs[i] || '');
        if (c === name) return null;                       // 候補自身がキャスト名=判定不要
        if (!/[\s　・]/.test(c)) continue;                 // (1) 姓名を分けて登録していない名前は対象外
        n2 = c.replace(/[\s　・]/g, '');
        if (n2 === name) return c;                         // 区切りを除くと完全一致=同一人物(fix456と同じ流儀)
        if (n2.length <= name.length) continue;
        var rest = n2.length - name.length;
        /* (2) 末尾完全一致(和名「霧 涼太」→「涼太」) または 先頭完全一致(洋名「アリア・リュミエール」→「アリア」)。
           (3) 残り(姓 or 名字側)は1〜6字。実測: 「アリア」seen1 が主人公アリア・リュミエールとは別人物として
               台帳に居た(smrrcv21iph)。末尾一致だけでは洋名順(名+姓)を救えないため両方向を見る。 */
        /* ★fix528e(2026-07-25・GPT監査): 先頭一致を「中黒区切り(洋名)」だけに限定する。
           旧実装は空白区切りでも先頭一致を許したため、反例(GPT):
             登録キャラ「佐藤 太郎」が居ると、**別人の「佐藤」**まで「登録キャラの別呼び」と誤判定され、
             準登録カルテに載らなくなる(＝存在が薄くなる)。日本語の空白区切りは 姓+名 なので
             先頭は姓＝他人と衝突しやすい。中黒区切りは 名+姓(洋名)で、先頭は個人名なので衝突しにくい。
           よって: 空白区切り → 末尾一致のみ / 中黒区切り → 先頭・末尾どちらも可。 */
        var tailHit = (n2.slice(n2.length - name.length) === name);
        var headHit = (n2.slice(0, name.length) === name) && (off528() || /・/.test(c));
        if (!tailHit && !headHit) continue;
        if (rest < 1 || rest > 6) continue;
        if (hit && hit !== c) return null;                 // (4) 一意でなければ見送り
        hit = c;
      }
      return hit;
    } catch(e){ return null; }
  }
  /* ★fix528g(2026-07-25・GPT監査の非阻止指摘): `turnIdx === cur`(進行中ターン)での解除を許すのは
       **生応答の現在parse経路(harvestRaw)だけ**に限定する。将来ほかの呼出元が cur を渡すと
       「未確定ターンでも解除できる」契約になってしまうため、source で明示する。 */
  function noteAppear(name, turnIdx, opts){
    name = validName(aliasFix(name));
    if (!name) return;
    if (castNames().indexOf(name) >= 0) return;
    /* ★fix830: 表記ゆれ（簡体 ↔ 繁体 ↔ 新字体）だけが違う登録済みキャストは同一人物。準登録を作らない。 */
    if (f830AutoMatch(name, castNames())) return;
    if (!off528() && castPartOwner(name)) return;   // ★fix528b: 登録キャラの名だけ呼び=別人物にしない
    var qs = loadQ();
    /* ★fix830: 準登録台帳のキーも同じ述語で寄せる（渔师 と 漁師 がカルテ 2 枚に割れるのを止める）。
       採用するキーは **既存の表示形そのまま**。fold した文字列は 1 バイトも保存しない（fix764 の設計線）。 */
    var qkey = f830AutoMatch(name, Object.keys(qs)) || name;
    var e = qs[qkey] || { seen: [], ali: [] };
    /* ★fix528d-b(2026-07-25・おしん指摘の再発条件を潰す):
         「未来のターン番号」を持つ残骸は sf(suspended-future) で【再観測まで注入禁止】にする。
       なぜ一時除外では足りないか: 旧実装は quasiRecent で `last > cur-1` を弾くだけだったので、
         物語が進んで現在ターンが last に追いつくと、別物語由来の残骸がそのまま
         「最近登場した人物」として復活してしまう(例: 8ターン物語 + last=13 → 13ターン目で復活)。
       解除条件は「この物語で実際に再観測されたこと」だけ。ここ(noteAppear)は
         <say|react|state who=> と _convSays の話者からしか呼ばれない＝実観測そのもの。
       解除時に seen を「この物語に実在するターン番号」だけへ絞る。別物語の登場実績を
         引き継いだまま復活すると、初回観測で即 seen>=3 を満たして誤って準登録化するため。
         捨てる番号は削除せず e.sfSeen へ退避する(非破壊・形式追加は1キーのみ)。
       正当な巻き戻しでも、その人物が新しい進行で再登場すれば同じ経路で自動解除される。
       OFF: v292Dfix528Off='1' */
    if (!off528() && e.sf){
      /* ★fix528f(2026-07-25・GPT監査で判明した実装ミス):
           解除条件を `turnIdx <= curN - 1` にしていたが、生応答からの収穫 harvestRaw は
           **まだ S.turns へ push される前**に `turnIdx = S.turns.length`(=curN) を渡す構造なので、
           この条件は**必ず外れる**。その結果 <state>/<react> にだけ出た人物は永久に解除されず、
           正当に再登場しても復活しない経路が残っていた(会話ログ話者は後追いの syncConv で
           有効な番号が渡るため偶然解除できていた＝実行順依存)。
           → 進行中ターンの index(=curN)も「この物語の実在ターン」として許可する。
           別物語の残骸(例: 8ターン物語に last=13)は harvest からは curN 以下しか渡らないので
           これで誤解除は起きない。 */
      var curN = storyTurnCount();
      var maxOk = (opts && opts.source === 'current-parse') ? curN : (curN - 1);   // ★fix528g: curを許すのは生応答の現在parse経路だけ
      if (!(curN > 0 && turnIdx >= 0 && turnIdx <= maxOk)) return;   // この物語に実在する(進行中を含む)ターンでの観測でなければ解除しない
      delete e.sf;
      qDirty = true;
      try { console.log(TAG, 'fix528d: 再観測により復帰:', name, '@turn', turnIdx); } catch(_){}
    }
    if (e.seen.indexOf(turnIdx) < 0){
      e.seen.push(turnIdx);
      if (e.seen.length > 40) e.seen = e.seen.slice(-40);
      qDirty = true;
    }
    if ((e.last || 0) < turnIdx){ e.last = turnIdx; qDirty = true; }
    qs[qkey] = e;
    // 台帳の暴走防止: 60ターン以上前が最終登場のエントリは間引く(50件超のときだけ)
    try {
      var keys = Object.keys(qs);
      if (keys.length > 50){
        var S = getS(); var cur = (S && S.turns) ? S.turns.length : 0;
        keys.forEach(function(k){ if (cur - ((qs[k] && qs[k].last) || 0) > 60) { delete qs[k]; qDirty = true; } });
      }
    } catch(e2){}
  }
  function harvestRaw(raw, turnIdx){
    try {
      var txt = caseViewOn() ? caseViewForAnalysis(String(raw || '')) : String(raw || ''); var m;   /* ★CASE_VIEW A1(解析用コピーのみ・raw 不変) */
      var re1 = /<(?:say|react|state)\b[^>]*?who="([^"]{1,24})"/g;
      while ((m = re1.exec(txt))) noteAppear(m[1], turnIdx, { source: 'current-parse' });
      var re2 = /<say\s+who='([^']{1,24})'/g; /* react声の入れ子(単引用) */
      while ((m = re2.exec(txt))) noteAppear(m[1], turnIdx, { source: 'current-parse' });
    } catch(e){}
  }

  /* ★fix537(2026-07-25・30ターン実機で捕獲): 「名乗り」で同一性が確定した時だけ、記述的な呼称を新しい名前へ紐づける。
     実測: 30ターン後、同一人物が4つの台帳すべてで別人のまま残っていた。
       会話カード(少女5枚 / シオン12枚) / 準登録カルテ(少女#3 / シオン#6) /
       ロスター(白いワンピースの少女 / シオン) / キャラ一覧(少女@29 と シオン@17)。
       本文には <say who="シオン">シオンっていうんだ……たぶん</say> という**決定的証拠**がある。
     設計原則(GPT監査): 「女将が出たから民宿の女将を表示」ではなく
       「**民宿の女将＝女将と既に確定しているから**表示」。名乗りは、その"確定"にあたる最強の証拠。
     したがって外見の類似や部分一致では一切統合せず、**本人が名乗った時だけ**別名として記録する。
     成立条件(すべて満たす時だけ・1つでも欠けたら何もしない):
       (1) そのターンに who=W のカードがあり、W が**この物語で初出**(台帳に無い or 今ターンが初seen)
       (2) その台詞が **W 自身の名乗り**である(「Wっていうんだ」「Wという」「名前はW」「私はWだ」等)
       (3) 直近3ターンに、**記述的な仮呼称 L**(少女/少年/男/女/子供/影/人影 で終わる呼称)が台帳にあり、
           その L がちょうど1つに定まる(2つ以上あれば曖昧なので見送り)
       (4) L も W も登録キャスト名ではない(登録キャラ同士は絶対に統合しない)
     やること: 既存の別名機構へ addAlias(W, L) を1件足すだけ。以降 aliasFix が who を W へ正規化し、
       fix77の状態も mergeAliasStates が W へ寄せ、キャラ一覧の重複表示も消える(全部既存の仕組み)。
     可逆性: 台帳の ali 配列に1要素増えるだけ。消せば元に戻る。ログは v292Dfix537_log。
     OFF: localStorage v292Dfix537Off='1' */
  var DESCRIPTIVE_TAIL = /(少女|少年|女|男|子供|子ども|娘|息子|影|人影|老人|老婆|青年|婦人)$/;
  function off537(){ try { return localStorage.getItem('v292Dfix537Off') === '1'; } catch(e){ return false; } }

  /* ============ HOT_LOG_SLOT_ATTRIBUTION v1.1 (②C1 裁定 EN-4 / EO-3 / ★EP UNIQUE-ATTRIBUTION) ============
     FEATURE / VERSION / 契約の全文は本 file 冗頭の header を規定とする。
     ここにあるのは (1) opt-in/kill の読み (2) slot gate 付き stamp 書込み
     (3) `entry.s === current slot` を必須にした唯一の READ 経路 (4) 非永続の診断口 の 4 つだけであり、
     検出意味誺（detectSelfNaming の成立条件）と ali 台帳には 1 行も触れない。
     ★key / cap 30 / FIFO(slice(-30)) / 既存 4 field は不変。stamp `s` は **末尾追加のみ**。
     ★新しい永続 key は 0 本（counter は in-memory。hlsDiag() で読む）。
     既定 OFF: 'v292Dfix537SlotLogOn'='1' で opt-in / 'v292Dfix537SlotLogOff'='1' が **優先** して kill。 */
  var HLS_FEATURE = 'HOT_LOG_SLOT_ATTRIBUTION';
  var HLS_VERSION = 'HOT_LOG_SLOT_ATTRIBUTION/v1.1';
  var HLS_KEY     = 'v292Dfix537_log';    /* ★不変（reader が literal 直書き。key を移すと全員が空を読む） */
  var HLS_CAP     = 30;                   /* ★不変（production と同じ FIFO 上限） */
  var HLS_STAMP   = 's';                  /* ★entry 末尾に追加する slot stamp field 名 */
  /* 非永続 counter（新しい localStorage key を作らないため in-memory のみ） */
  var hlsSkipNoSlot = 0, hlsQuota = 0, hlsWrote = 0, hlsLast = 'init';
  function hlsOn(){
    try {
      if (localStorage.getItem('v292Dfix537SlotLogOff') === '1') return false;   /* kill が opt-in に勝つ */
      return localStorage.getItem('v292Dfix537SlotLogOn') === '1';               /* 既定 = OFF */
    } catch(e){ return false; }                                                  /* throw → OFF */
  }
  function hlsKilled(){ try { return localStorage.getItem('v292Dfix537SlotLogOff') === '1'; } catch(e){ return false; } }
  function hlsLoad(){
    var a = null;
    try { a = JSON.parse(localStorage.getItem(HLS_KEY) || '[]'); } catch(e){ a = null; }
    return Array.isArray(a) ? a : [];
  }
  /* ---- WRITE（EN-4）: authoritative slot があるときだけ stamp 付きで保存。無ければ書かない ----
     既存 entry（他 slot / stamp 無し）は **読んでそのまま戻すだけ**。書き換えない = provenance 捕造 0。 */
  function hlsWrite(turnIdx, L1, W){
    var sfx = slotSfx();
    if (sfx === null){ hlsSkipNoSlot++; hlsLast = 'skip-no-slot'; return false; }   /* fix783 契約の穴を塞ぐ */
    var lg = hlsLoad();
    var ent = { ts: Date.now(), turn: turnIdx, alias: L1, canonical: W };
    ent[HLS_STAMP] = sfx;                 /* ★末尾追加のみ（JSON の prefix は production 形と逐語一致） */
    lg.push(ent);
    try { localStorage.setItem(HLS_KEY, JSON.stringify(lg.slice(-HLS_CAP))); }
    catch(e){ hlsQuota++; hlsLast = 'ls-write-failed'; return false; }
    hlsWrote++; hlsLast = 'written';
    return true;
  }
  /* ---- migration の証明述語（EN-4 「たぶんこの slot」禁止 → ★EP 「一意にしか一致しない」）----
     P2 store[canonical].ali に alias がある（= L515 相当の ent.ali.push(L1) がその slot の台帳へ書いた edge）
     P3 entry.turn が store[canonical].seen に実在する（= 同一 event の turn が台帳側にも記録されている）
     → この 2 つは「ある slot の台帳と矛盾しない」という候補条件にすぎない。 */
  function hlsProve(e, store){
    try {
      if (!e || !store) return false;
      var ent = store[e.canonical];
      if (!ent || !Array.isArray(ent.ali) || ent.ali.indexOf(e.alias) < 0) return false;      /* P2 */
      return Array.isArray(ent.seen) && ent.seen.indexOf(e.turn) >= 0;                        /* P3 */
    } catch(x){ return false; }
  }
  /* ---- 候補 slot の全数調査（★EP: UNIQUE ATTRIBUTION）----
     既存の slot-scoped evidence = 各 slot の台帳 'v292Dfix277Quasi'+sfx を **全部**見る。
     current slot の台帳だけは loadQ()（未保存のメモリ状態を含む正本）を使い、
     他 slot は localStorage の実体を読む（read のみ・write 0）。 */
  var HLS_QPREFIX = 'v292Dfix277Quasi';        /* ★既存 key。新規 key は 1 本も作らない */
  function hlsSlotSfxs(){
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++){
        var k = localStorage.key(i);
        if (typeof k === 'string' && k.indexOf(HLS_QPREFIX) === 0){
          var s = k.slice(HLS_QPREFIX.length);
          if (out.indexOf(s) < 0) out.push(s);
        }
      }
    } catch(e){}
    return out;
  }
  function hlsLedgerOf(sfx, curSfx){
    if (curSfx !== null && sfx === curSfx){ try { return loadQ(); } catch(e){ return null; } }
    try { var o = JSON.parse(localStorage.getItem(HLS_QPREFIX + sfx) || 'null');
          return (o && typeof o === 'object') ? o : null; } catch(e){ return null; }
  }
  function hlsCandidateSlots(e, curSfx){
    var sfxs = hlsSlotSfxs(), out = [];
    if (curSfx !== null && sfxs.indexOf(curSfx) < 0) sfxs.push(curSfx);   /* 未保存の current slot も母数に入れる */
    for (var i = 0; i < sfxs.length; i++){
      if (hlsProve(e, hlsLedgerOf(sfxs[i], curSfx))) out.push(sfxs[i]);
    }
    out.sort();
    return out;
  }
  /* ---- 分類（データ区分は 4 つだけ。AMBIGUOUS_SLOT は作らない）----
     CURRENT                  : stamp が current slot と一致
     FOREIGN                  : stamp が他 slot / または legacy でありながら他 slot に **一意に** 帰属した
     CURRENT_PROVEN_BY_LEDGER : legacy であり、候補 slot が current slot の **1 件だけ**
     UNKNOWN_SLOT             : 候補 0 件 / 候補 2 件以上 / slot 権威なし / entry が不正
     ★UNKNOWN_SLOT は positive evidence にならない。reason で 0 件と複数を分けるのは **診断のためだけ**。 */
  function hlsClassifyEx(e, sfx){
    if (!e || typeof e !== 'object') return { cls: 'UNKNOWN_SLOT', reason: 'entry-invalid', candidates: [] };
    if (typeof e[HLS_STAMP] === 'string'){
      return (e[HLS_STAMP] === sfx)
        ? { cls: 'CURRENT', reason: 'stamp-current', candidates: [] }
        : { cls: 'FOREIGN', reason: 'stamp-foreign', candidates: [] };
    }
    if (sfx === null) return { cls: 'UNKNOWN_SLOT', reason: 'no-slot-authority', candidates: [] };
    var c = hlsCandidateSlots(e, sfx);
    if (c.length === 0) return { cls: 'UNKNOWN_SLOT', reason: 'ledger-no-candidate', candidates: c };
    if (c.length > 1)  return { cls: 'UNKNOWN_SLOT', reason: 'ledger-ambiguous-multi', candidates: c };
    return (c[0] === sfx)
      ? { cls: 'CURRENT_PROVEN_BY_LEDGER', reason: 'ledger-unique-current', candidates: c }
      : { cls: 'FOREIGN', reason: 'ledger-unique-other-slot', candidates: c };
  }
  function hlsClassify(e, sfx){ return hlsClassifyEx(e, sfx).cls; }
  /* ---- READ: 唯一の正規 consumer 経路 ----
     ACTIVE_PRODUCTION_RUNTIME_CONSUMERS_INSIDE_FIX277 = SLOT_SCOPED。
     current に入るのは `entry.s === 現在 slot` または **一意に**台帳で証明できた entry だけ。
     foreign（他 slot）と unknown（候補 0 / 候補複数 / 権威なし）は
     **証拠として返すが current には絶対に混ざない**。
     この戻り値は AUDIT_EVIDENCE_ONLY。fix845 crossCheck / XLE STRONG / canonicalize / merge /
     identity promotion の入力にしてはならない（fix277 内からの呼び出しは 0 件）。 */
  function hlsRead(){
    var sfx = null; try { sfx = slotSfx(); } catch(e){ sfx = null; }
    var all = hlsLoad();
    var cur = [], foreign = [], unknown = [], rows = [];
    var rc = { 'stamp-current': 0, 'stamp-foreign': 0, 'no-slot-authority': 0, 'entry-invalid': 0,
               'ledger-unique-current': 0, 'ledger-unique-other-slot': 0,
               'ledger-no-candidate': 0, 'ledger-ambiguous-multi': 0 };
    for (var i = 0; i < all.length; i++){
      var x = hlsClassifyEx(all[i], sfx);
      rc[x.reason] = (rc[x.reason] || 0) + 1;
      rows.push({ i: i, cls: x.cls, reason: x.reason, candidates: x.candidates });
      if (x.cls === 'CURRENT' || x.cls === 'CURRENT_PROVEN_BY_LEDGER') cur.push(all[i]);
      else if (x.cls === 'FOREIGN') foreign.push(all[i]);
      else unknown.push(all[i]);
    }
    return { feature: HLS_FEATURE, version: HLS_VERSION, contract: 'AUDIT_EVIDENCE_ONLY',
             readContract: 'ACTIVE_PRODUCTION_RUNTIME_CONSUMERS_INSIDE_FIX277 = SLOT_SCOPED',
             attribution: 'UNIQUE_ATTRIBUTION_REQUIRED',
             on: hlsOn(), slot: sfx, total: all.length,
             current: cur, foreign: foreign, unknown: unknown,
             currentCount: cur.length, foreignCount: foreign.length, unknownCount: unknown.length,
             reasonCounts: rc, rows: rows, slotsSeen: hlsSlotSfxs().sort(),
             classOf: function(e){ return hlsClassify(e, sfx); },
             reasonOf: function(e){ return hlsClassifyEx(e, sfx).reason; },
             candidatesOf: function(e){ return hlsClassifyEx(e, sfx).candidates; } };
  }
  function hlsDiag(){
    var r = hlsRead();
    return { feature: HLS_FEATURE, version: HLS_VERSION, contract: 'AUDIT_EVIDENCE_ONLY',
             readContract: r.readContract, attribution: r.attribution,
             on: hlsOn(), killed: hlsKilled(), key: HLS_KEY, cap: HLS_CAP, stampField: HLS_STAMP,
             slot: r.slot, total: r.total, current: r.currentCount, foreign: r.foreignCount,
             unknown: r.unknownCount, reasonCounts: r.reasonCounts, slotsSeen: r.slotsSeen,
             unknownNoCandidate: r.reasonCounts['ledger-no-candidate'],
             unknownAmbiguous: r.reasonCounts['ledger-ambiguous-multi'],
             skipNoSlot: hlsSkipNoSlot, quota: hlsQuota, wrote: hlsWrote,
             lastReason: hlsLast, persistentKeysAdded: 0 };
  }
  /* ================ /HOT_LOG_SLOT_ATTRIBUTION ================ */

  function namingOf(text, who){
    var t = String(text || ''), w = String(who || '');
    if (!w || w.length < 2) return false;
    var i = t.indexOf(w);
    while (i >= 0){
      var after = t.slice(i + w.length, i + w.length + 8);
      var before = t.slice(Math.max(0, i - 6), i);
      if (/^(?:って(?:いう|言う)|という|と言う|と呼(?:んで|ばれ)|です|だ(?:よ|けど)?[。、！\s]?$|だ[。、！])/.test(after)) return true;
      if (/(名前は|名は|わたしは|私は|僕は|俺は|あたしは)[\s　]*$/.test(before)) return true;
      i = t.indexOf(w, i + 1);
    }
    return false;
  }
  function detectSelfNaming(raw, turnIdx){
    try {
      if (off537() || offQ()) return;
      var txt = caseViewOn() ? caseViewForAnalysis(String(raw || '')) : String(raw || ''), m, cast = castNames();   /* ★CASE_VIEW A2(解析用コピーのみ・raw 不変) */
      var re = /<say\s+who="([^"]{2,24})"\s*>([\s\S]{0,200}?)<\/say>/g;
      var qs = loadQ();
      while ((m = re.exec(txt))){
        var W = validName(String(m[1] || '').trim());
        if (!W || cast.indexOf(W) >= 0) continue;                 // (4) 登録キャストは対象外
        var e = qs[W];
        var firstTime = !e || !Array.isArray(e.seen) || e.seen.length === 0 ||
                        (e.seen.length === 1 && e.seen[0] === turnIdx);
        if (!firstTime) continue;                                  // (1) この物語で初出のときだけ
        if (!namingOf(m[2], W)) continue;                          // (2) 本人の名乗り
        /* (3) 直近3ターンの記述的な仮呼称をちょうど1つ探す */
        var cands = [];
        Object.keys(qs).forEach(function(L){
          if (L === W || cast.indexOf(L) >= 0) return;
          if (!DESCRIPTIVE_TAIL.test(L)) return;
          var le = qs[L]; if (!le) return;
          var last = le.last || 0;
          if (turnIdx - last > 3) return;
          if ((le.ali || []).indexOf(W) >= 0) return;
          cands.push(L);
        });
        if (cands.length !== 1) continue;                          // 曖昧なら見送り
        var L1 = cands[0];
        var ent = qs[W] || { seen: [], ali: [] };
        ent.ali = ent.ali || [];
        if (ent.ali.indexOf(L1) < 0) ent.ali.push(L1);
        /* L 側の登場実績を W へ引き継ぐ(同一人物なので実績も同一人物のもの) */
        var le2 = qs[L1];
        if (le2 && Array.isArray(le2.seen)){
          le2.seen.forEach(function(x){ if ((ent.seen = ent.seen || []).indexOf(x) < 0) ent.seen.push(x); });
          if ((ent.last || 0) < (le2.last || 0)) ent.last = le2.last;
        }
        qs[W] = ent; qDirty = true; aliasCache = null;
        /* ★HOT_LOG_SLOT_ATTRIBUTION v1: 既定 OFF = 下の 5 行（production L523-527 相当）を
           **1 バイトも変えずに**実行する。ON のときだけ slot gate + stamp 版へ分岐する。 */
        if (hlsOn()){ try { hlsWrite(turnIdx, L1, W); } catch(e2h){} } else
        try {
          var lg = JSON.parse(localStorage.getItem('v292Dfix537_log') || '[]');
          lg.push({ ts: Date.now(), turn: turnIdx, alias: L1, canonical: W });
          localStorage.setItem('v292Dfix537_log', JSON.stringify(lg.slice(-30)));
        } catch(e2){}
        try { console.log(TAG, 'fix537: 名乗りで同一性確定:', L1, '=', W); } catch(e3){}
        try { saveQ(); normalizeConvWho('fix537:' + L1 + '=' + W); } catch(e4){}   // ★fix538
      }
    } catch(e){}
  }

  /* ============ ★fix537pt / PRENAME_WHO_TRANSITION v1.4 (②C1 裁定 EZ-2 GO ＋ 裁定 FA ＋ ★裁定 FC) ============
     ★v1.4 の変更は FC-2 の 1 点だけ（v1.3 からの差分はこの 1 箇所のみ・既存 namingOf() は 1 バイトも触らない）:
       FC-2 COPULA_INTRO_CONTINUATION_FORM (e) を PT detector **だけ**に追加。
            live canary PT2（gold/F537PT_PT2_CANARY_LIVE_v1.md §0/§1 turn 5）で観測した
              <say who="婆さん">景子だよ。みんな景ちゃん景ちゃん呼びだがね。</say> → <say who="景子">
            を v1.3 が落とした（drop = no-self-naming）。根本原因は既存 namingOf L769 の copula 分岐
            `だ(?:よ|けど)?[。、！\s]?$` が **8 字窓の末尾アンカー**を要求すること（= 台詞が続くと false）。
            FC-2 により既存 namingOf の修正は REJECT されたので、PT 側に次の狭い形だけを足す:
              ptNameLeading(pre) が真（= 発話の実質先頭が X）∧ X の直後が (だよ|だ|です|だけど) ＋ 句読点。
              → 後続文が続いてもよい。第三者文（「妹は景子だよ。…」）は name-leading 条件で落とす。
              → immediate next say who == X（N-3）は従来どおり必須（単独では発火しない二重根拠）。
     ★v1.3 の変更は FA-3 / FA-2 の 2 点だけ（detectSelfNaming 不触・v1.2 からの変更もこの 2 箇所のみ）:
       FA-3 (PT-Q5 = REJECT) EXISTING DETECTOR PRIORITY = **SAME-TURN ONLY**
            ／ HISTORICAL ALIAS PRESENCE != SUPPRESSION AUTHORITY。
            抑止は「既存 detectSelfNaming が **同じ turn で同じ canonical X** の edge を既に生成した」ときだけ
            （ptSameTurnEdge: hot log の {turn, canonical} を読むだけ・新 key 0）。
            過去 turn の ali 履歴は抑止理由にしない。同一 turn 同一 (alias,canonical) の重複 0 と
            1 canonical / turn 最大 1 edge は維持（ent.ali.indexOf(L) ＋ done[X]）。
       FA-2 (PT-Q2 = 条件付き ACCEPT) READING_ANNOTATION_FORM = ACCEPTED / ARBITRARY_SUBSTRING_MATCH = REJECTED。
            読み仮名形 (d) は **name-only / name-leading utterance** のときだけ有効。
            = X より前が「間投記号・句読点」＋「名前（＋読み）＋区切り」の並びだけで構成されている発話。
            一般文中に埋め込まれた X（読み）（例「妹は篠宮 黎（れい）っていうんだ」）は通さない。
     正本 = gold/PRENAME_WHO_TRANSITION_SOURCE_DIFF_v1.md §3（最小修正案）＋ §8（裁定 EZ・PQ-1〜7。§3 と食い違う点は §8 が勝つ）
            ＋ gold/F537PT_OFFLINE_IMPLEMENTATION_v1.md §8 追記（裁定 FA。PT-Q5 だけ §8 PQ-5 を上書きする）。
     上の detectSelfNaming / namingOf / validName / DESCRIPTIVE_TAIL / hlsWrite / loadQ / saveQ は **1 バイトも変更していない**。
     本検出器はその横に並置する第 2 検出器であり、既存条件を 1 つも緩めない（緩めると FX-4 型の誤 edge が立つ = 設計 §3.1）。
     検出 = 「旧/記述的 who L の say 本文に X の名乗りがあり、**その直後の say の who が X**」の 2 点同時成立のみ。
       N-1 同一 turn の say 列（who 下限だけ 1 に下げた本検出器**専用**の正規表現。L779 は触らない）
       N-2 says[i].body に X の明示的 self-naming 構文（既存 namingOf ＋ (a) 鉤括弧形 / (b) 読点許容形 /
           (c) 名は形 / (d) 読み仮名形 / ★(e) copula-intro continuation 形 の合議。
           PQ-2 により一人称マーカは要求しない。(d)(e) は ptNameLeading 必須）
       N-3 **IMMEDIATE_NEXT_SAY_ONLY**（PQ-1・同一 turn のみ・次 turn へ跨がせない）。
           ★「直後の say」の解釈 = i の次に現れる **異なる who の say** 1 本だけ（同一 who の連続 say は読み飛ばす）。
             その 1 本の who が X でなければ落とす（next-who-mismatch は no-self-naming として記録される）。
       N-4 L = says[i].who そのもの（1 文字可。台帳一意性ヒューリスティックは使わない = FX-4 型の誤 L を構造的に遮断）／
           X = 2〜12 字（PQ-2。1 文字 canonical は v1 対象外）・内部空白 1 個まで許容（PQ-3）・
           DESCRIPTIVE_TAIL / GENERIC_HUB / BAD / PLACEHOLDER（すべて**既存**定数）を再利用して記述語・代名詞を落とす・
           L !== X（空白正規化して比較）・両方 cast 外・X がこの物語で初出（既存 firstTime 述語と同形）。
     二重発火（PQ-5 → ★FA-3 で上書き）: 既存 detectSelfNaming が先に走り、**同じ turn で同じ canonical X** の
       edge を既に生成していたときだけ本検出器は降りる（supplement only ／ 1 canonical・1 turn あたり最大 1 edge ／
       同一 (alias,canonical) の重複生成 0）。**過去 turn の ali 履歴では降りない**。
     出力先は既存の 2 本だけ: 台帳 v292Dfix277Quasi<sfx> の ent.ali.push(L) と hot log v292Dfix537_log
       （HLS ON なら hlsWrite 経由 = S-2 slot gate ＋ s stamp）。**新しい永続 key 0 本・hot log の新 field 0**。
     既定 OFF: opt-in 'v292Dfix537PtOn'='1' ／ kill 'v292Dfix537PtOff'='1'（kill が勝つ）。
       off537 / offQ は本フラグより **上位**。storage read が throw → OFF（FAIL TO PRODUCTION）。
     診断は非永続（in-memory・ptDiag()）。fix640 source 変更 0 ／ fix640 の key への write 0。 */
  var PT_SAY   = /<say\s+who="([^"]{1,24})"\s*>([\s\S]{0,200}?)<\/say>/g;   /* L779 と同型・who 下限のみ 1 */
  var PT_KAGI  = /[「『]([^「」『』]{2,12})[」』][\s　]*[、，]?[\s　]*(?:って|と)[\s　]*[、，]?[\s　]*(?:呼ば|言わ|いわ|いう|言う|申し|名乗)/g;
  var PT_AFTER = /^[、，]?[\s　]*(?:って(?:いう|言う|呼ば|呼ぶ)|という|と言う|と呼ば|と申し|と名乗)/;
  var PT_YOMI  = /^[（(《〈][^）)》〉]{1,12}[）)》〉]/;
  var PT_BEFORE= /(名前は|名は|名を|わたしは|私は|僕は|俺は|あたしは)[\s　]*$/;
  var PT_THIRD = /(あの子|その子|あいつ|あの人|その人|あの方|彼女|彼|奴)[はがもの]?[\s　]*$/;   /* 第三者紹介の遮断(FP-4・★9 語で凍結) */
  /* ★FA-2: (d) 読み仮名形の前提。X より前が「名前(＋読み)＋区切り」の並びだけで出来ていること。 */
  var PT_LEADCUT = /^[\s　…‥・、，。．！？!?ー—―－〜~“”"']+/;
  var PT_NAMESEQ = /^(?:[一-龥々〆ヵヶぁ-んァ-ヶーA-Za-zＡ-Ｚａ-ｚ・]{1,12}(?:[（(《〈][^）)》〉]{1,12}[）)》〉][\s　、，。．…‥・]*|[、，。．…‥・]+[\s　]*))*$/;
  /* ★FC-2 (e) copula-intro continuation 形: X の直後が (だよ|だ|です|だけど) ＋ 句読点。
     既存 namingOf L769 と違い **末尾アンカーを要求しない**ので「景子だよ。みんな…」のように台詞が続いてもよい。
     単独では発火せず、ptNameLeading（発話の実質先頭が X）と N-3（直後 say の who == X）の二重根拠が要る。 */
  var PT_COPULA  = /^(?:だよ|だけど|だが|です|だ)[。、，．！？!?…‥]/;
  var ptWrote = 0, ptLast = 'init', ptDrops = [], ptThirdHit = false, ptLeadBlocked = false, ptCopulaBlocked = false;
  function ptKilled(){ try { return localStorage.getItem('v292Dfix537PtOff') === '1'; } catch(e){ return false; } }
  function ptOn(){ try { if (localStorage.getItem('v292Dfix537PtOff') === '1') return false;   /* kill 優先 */
                         return localStorage.getItem('v292Dfix537PtOn') === '1'; } catch(e){ return false; } }
  function ptNorm(s){ return String(s || '').replace(/[ 　]/g, ''); }        /* 比較時のみの空白正規化(PQ-3) */
  function ptValidX(n){
    var s = String(n || ''), sp = s.match(/[\s　]/g);
    if (/^[\s　]|[\s　]$/.test(s) || (sp && sp.length > 1)) return '';        /* 前後空白 不可・内部空白は最大 1 個 */
    if (!validName(ptNorm(s))) return '';                                    /* ★既存 validName を再利用(2-12 字) */
    return (DESCRIPTIVE_TAIL.test(s) || GENERIC_HUB.test(s)) ? '' : s;       /* ★既存 記述語/役名 predicate を再利用 */
  }
  function ptNameLeading(pre){   /* ★FA-2: name-only / name-leading utterance か（一般文中の埋め込みを落とす） */
    return PT_NAMESEQ.test(String(pre || '').replace(PT_LEADCUT, ''));
  }
  function ptNaming(body, X){
    var t = String(body || ''), i = t.indexOf(X), m, h, yomi, cop, lead;
    ptThirdHit = false; ptLeadBlocked = false; ptCopulaBlocked = false;
    for (; i >= 0; i = t.indexOf(X, i + 1)){
      var af = t.slice(i + X.length, i + X.length + 10);
      yomi = PT_YOMI.test(af); cop = PT_COPULA.test(af); lead = (yomi || cop) ? ptNameLeading(t.slice(0, i)) : false;
      if (yomi && !lead) ptLeadBlocked = true;      /* ★ARBITRARY_SUBSTRING_MATCH = REJECTED */
      if (cop  && !lead) ptCopulaBlocked = true;    /* ★FC-2: 第三者文「妹は景子だよ。…」はここで落ちる */
      h = PT_AFTER.test(af) ? 'b' : (cop && lead) ? 'e' : (yomi && lead) ? 'd'
          : PT_BEFORE.test(t.slice(Math.max(0, i - 8), i)) ? 'c' : (namingOf(X + af, X) ? 'n' : '');
      if (h){ if (!PT_THIRD.test(t.slice(Math.max(0, i - 12), i))) return h; ptThirdHit = true; }
    }
    for (PT_KAGI.lastIndex = 0; (m = PT_KAGI.exec(t)); ){
      if (m[1] === X){ if (!PT_THIRD.test(t.slice(Math.max(0, m.index - 12), m.index))) return 'a'; ptThirdHit = true; }
    }
    return '';
  }
  /* ★FA-3: 既存 detector の抑止権は **same-turn only**。hot log の {turn, canonical} を読むだけ（新 key 0）。 */
  function ptSameTurnEdge(turnIdx, X){
    try {
      var lg = JSON.parse(localStorage.getItem('v292Dfix537_log') || '[]');
      if (!Array.isArray(lg)) return false;
      for (var i = lg.length - 1; i >= 0; i--){
        var e = lg[i]; if (e && e.turn === turnIdx && e.canonical === X) return true;
      }
    } catch(e){}
    return false;
  }
  function detectPrenameWhoTransition(raw, turnIdx){
    ptDrops = [];
    try {
      if (off537() || offQ()){ ptLast = 'off-upper'; return; }                /* ★上位 kill が優先 */
      if (!ptOn()){ ptLast = ptKilled() ? 'killed' : 'off'; return; }         /* ★既定 OFF */
      var txt = caseViewOn() ? caseViewForAnalysis(String(raw || '')) : String(raw || ''), m, cast = castNames(), says = [];
      for (PT_SAY.lastIndex = 0; (m = PT_SAY.exec(txt)); ) says.push({ who: String(m[1] || '').trim(), body: String(m[2] || '') });
      if (says.length < 2){ ptLast = 'no-who-transition'; ptDrops.push('no-who-transition'); return; }
      var qs = loadQ(), done = {}, drop = function(r){ ptDrops.push(r); ptLast = r; };
      for (var i = 0; i < says.length - 1; i++){
        var L = says[i].who, j = i + 1, X, xe, ent, why; if (!L) continue;
        while (j < says.length && says[j].who === L) j++;                      /* 直後 = 次に現れる異なる who */
        if (j >= says.length){ drop('no-who-transition'); continue; }
        X = ptValidX(says[j].who);
        if (!X){ drop(ptNorm(says[j].who).length < 2 ? 'canonical-too-short' : 'invalid-canonical'); continue; }
        if (ptNorm(L) === ptNorm(X)){ drop('same-who'); continue; }
        if (cast.indexOf(L) >= 0 || cast.indexOf(X) >= 0){ drop('cast'); continue; }
        if (BAD.test(L) || (!off528() && PLACEHOLDER.test(L))){ drop('invalid-alias'); continue; }   /* ★既存定数の再利用 */
        if (done[X]){ drop('one-edge-per-canonical'); continue; }
        xe = qs[X];
        if (xe && Array.isArray(xe.seen) && xe.seen.length &&
            !(xe.seen.length === 1 && xe.seen[0] === turnIdx)){ drop('not-first-time'); continue; }
        why = ptNaming(says[i].body, X);
        if (!why){ drop(ptThirdHit ? 'third-party-introduction'
                        : ptLeadBlocked ? 'reading-form-not-name-leading'
                        : ptCopulaBlocked ? 'copula-form-not-name-leading' : 'no-self-naming'); continue; }
        if (ptSameTurnEdge(turnIdx, X)){ drop('existing-detector-priority-same-turn'); done[X] = 1; continue; }  /* ★FA-3 */
        ent = qs[X] || { seen: [], ali: [] }; ent.ali = ent.ali || [];
        if (ent.ali.indexOf(L) >= 0){ drop('duplicate-edge'); done[X] = 1; continue; }   /* 同一 (alias,canonical) 重複 0 */
        ent.ali.push(L); qs[X] = ent; qDirty = true; aliasCache = null; done[X] = 1;
        /* ★出力は既存 detectSelfNaming と同形の 5 行（HLS ON のときだけ slot gate + stamp 版へ分岐） */
        if (hlsOn()){ try { hlsWrite(turnIdx, L, X); } catch(e2h){} } else
        try {
          var lg = JSON.parse(localStorage.getItem('v292Dfix537_log') || '[]');
          lg.push({ ts: Date.now(), turn: turnIdx, alias: L, canonical: X });
          localStorage.setItem('v292Dfix537_log', JSON.stringify(lg.slice(-30)));
        } catch(e2){}
        ptWrote++; ptLast = 'written:' + why;
        try { console.log(TAG, 'fix537pt: 遷移名乗りで同一性確定:', L, '=', X); } catch(e3){}
        try { saveQ(); normalizeConvWho('fix537pt:' + L + '=' + X); } catch(e4){}
      }
    } catch(e){ ptLast = 'threw'; }
  }
  function ptDiag(){ return { version: 'PRENAME_WHO_TRANSITION/v1.4', on: ptOn(), killed: ptKilled(),
                              wrote: ptWrote, last: ptLast, drops: ptDrops.slice(), persistentKeysAdded: 0 }; }
  /* ============ /PRENAME_WHO_TRANSITION ============ */


  /* ★fix538(2026-07-25): 別名が確定したら、**保存済みの会話ログの話者も**正名へ寄せる。
     実測(30ターン試験): fix537 が 少女=シオン を確定させると、キャラ一覧と fix77 の状態は統合されるのに
     **保存済みカードは旧呼称のまま**だった(会話ログに2つの名前・keyForが名前ハッシュなので2つのアイコン)。
     やり方は fix409 と同じ流儀: 適用前に丸ごとバックアップを取り、ログを残し、OFFで止められる。
     対象は「明示的に宣言された別名」だけ = fix537(本人の名乗り) と キャラ説明の「別名:」行。
     推測による統合は一切しない。 OFF: localStorage v292Dfix538Off='1' */
  function off538(){ try { return localStorage.getItem('v292Dfix538Off') === '1'; } catch(e){ return false; } }
  var _bk538 = false;
  function normalizeConvWho(reason){
    try {
      if (off538()) return 0;
      var S = getS(); if (!S || !Array.isArray(S.turns)) return 0;
      var map = aliasMap(); var keys = Object.keys(map);
      if (!keys.length) return 0;
      /* 何件変わるか先に数える(0なら一切触らない=保存もバックアップもしない) */
      var n = 0;
      S.turns.forEach(function(t){
        ((t && t._convSays) || []).forEach(function(c){
          if (c && c.who && map[c.who] && map[c.who] !== c.who) n++;
        });
      });
      if (!n) return 0;
      if (!_bk538){
        try {
          /* ■fix784(2026-09-01) MULTI_TAB Tier3: backup provenance(控えの出所)
             真因: 控えの**元キー**が共有ポインタ chr6_active_slot(= __chr6Key()) 由来だったため、
               別タブが物語を開いた瞬間に **chr6_bk_fix538_<ts> の控えとして別 story の本体が保存される**。
               控え先キー名も形式もタイミングも正しいのに中身だけが他人の物語になる(= 出所誤り)。
               事故後の復元先として使えないだけでなく、別 story の本体を控え枠に居座らせる。
             対処: 控えの元キーだけを fix694 document authority(__chronicleDocumentStoryKey)で解決する。
               authority 無し document では**控えない** = 既存の fail-closed に合流し破壊的変更も行わない。
               退避先キー名・退避形式・退避タイミング・件数 trim は 1 バイトも変えていない。
             kill: localStorage v292Dfix783Off='1' → 旧共有ポインタ挙動(fix783 と共通の kill)。 */
          var k = null;
          if (!f783Off()){
            try { var _dk = window.__chronicleDocumentStoryKey; if (typeof _dk === 'string' && _dk) k = _dk; } catch(e){}
            if (!k) return 0;                            /* ■fix784: 控えない → 既存 fail-closed(話者正名化も行わない) */
          } else {
            k = (typeof window.__chr6Key === 'function') ? window.__chr6Key() : 'chr6';
          }
          var blob = localStorage.getItem(k);
          if (blob) localStorage.setItem('chr6_bk_fix538_' + Date.now(), JSON.stringify({ key: k, blob: blob, ts: Date.now() }));
          /* 新しい順3件だけ残す */
          /* ★fix579: 削除候補の列挙に Object.keys(localStorage) を使わない（正規の length+key(i) へ）。
             ラッパが localStorage.removeItem へ代入するため、メソッド名が own property として混ざる。 */
          var bks = [];
          for (var bi = 0; bi < localStorage.length; bi++){
            var bk = localStorage.key(bi);
            if (bk && /^chr6_bk_fix538_\d+$/.test(bk)) bks.push(bk);
          }
          /* 末尾13桁の時刻で数値比較する（キー全体の辞書順だと桁数が違うときに壊れる） */
          bks.sort(function(a, b){ return Number(a.slice(15)) - Number(b.slice(15)); });
          while (bks.length > 3){ try { localStorage.removeItem(bks.shift()); } catch(e){} }
          _bk538 = true;
        } catch(e){ return 0; }   /* 控えが取れないなら書き換えない(fail-closed) */
      }
      var changed = [];
      S.turns.forEach(function(t, ti){
        ((t && t._convSays) || []).forEach(function(c){
          if (c && c.who && map[c.who] && map[c.who] !== c.who){
            changed.push({ turn: ti + 1, from: c.who, to: map[c.who], say: String(c.say || '').slice(0, 14) });
            c.who = map[c.who];
          }
        });
      });
      if (changed.length){
        try { if (typeof S.save === 'function') (typeof S.saveC==='function'?S.saveC('fix277.normalizeConvWho'):S.save()); } catch(e){}
        try {
          var lg = JSON.parse(localStorage.getItem('v292Dfix538_log') || '[]');
          lg.push({ ts: Date.now(), reason: reason || '', n: changed.length, sample: changed.slice(0, 5) });
          localStorage.setItem('v292Dfix538_log', JSON.stringify(lg.slice(-20)));
        } catch(e){}
        try { if (window.__v292Dfix66 && typeof window.__v292Dfix66.repair === 'function') window.__v292Dfix66.repair(); } catch(e){}
        try { console.log(TAG, 'fix538: 会話ログの話者を正名へ統一:', changed.length, '件'); } catch(e){}
      }
      return changed.length;
    } catch(e){ return 0; }
  }

  function syncConv(){
    try {
      var S = getS(); if (!S || !Array.isArray(S.turns)) return;
      var n = S.turns.length;
      for (var i = Math.max(0, n - 8); i < n; i++){
        var t = S.turns[i]; if (!t || !Array.isArray(t._convSays)) continue;
        t._convSays.forEach(function(c){ if (c && c.who) noteAppear(c.who, i); });
      }
    } catch(e){}
  }

  function quasiRecent(){
    /* 準登録(累計3ターン登場)かつ直近5ターンに登場した名前を、最終登場が新しい順で返す */
    var out = [];
    var sfMarked = false;
    try {
      var S = getS(); var cur = (S && S.turns) ? S.turns.length : 0;
      var qs = loadQ();
      Object.keys(qs).forEach(function(n){
        var e = qs[n]; if (!e || !Array.isArray(e.seen)) return;
        /* ★fix528d(2026-07-25・実データで確定): 「この物語に存在しないターン番号」を最終登場に持つ
             エントリを sys 注入から外す。
           真因: 台帳キーは v292Dfix277Quasi<スロット接尾辞> だが、接尾辞は chr6_active_slot 由来。
             fix525/fix527 以前は active ポインタが全タブ共有だったため、別の物語を開いている間に
             書かれた台帳が他スロットのキーへ混入した(=別物語の登場人物が残っている)。
             さらに quasiRecent の窓判定は (cur - last) <= 5 なので、last が cur より大きい
             (=未来のターン番号を持つ残骸)と差が負になり【必ず窓内】と判定され、毎ターン
             「この人物も登場中」として sys に注入され続けていた。
           実測: smriifzelrt(8ターン)へ 桐生悠真(last13)・氷川杏子(last12)・杏子(last12)、
             smr8p8wfr8b(16ターン)へ 少女(last24) が現在も注入対象になっていた。
           対処は非破壊(注入から外すだけ・台帳は消さない)。巻き戻し直後に一時的に last>cur となる
             正当なケースでも、ターンが進めば自然に復帰する。
           ★fix528b の分身も同時に注入対象から外す(既存物語の台帳を書き換えずに効かせるため)。
           OFF: localStorage v292Dfix528Off='1' */
        if (!off528()){
          /* ★fix528d-b: 一時除外ではなく「再観測まで注入禁止」。cur===0(起動直後で物語未ロード)では
               全件が未来扱いになってしまうので、必ず cur>0 のときだけ判定する。 */
          if (cur > 0 && !e.sf && (e.last || 0) > cur - 1){
            suspendFuture(e, n, cur);                 // この物語に無いターン番号=別物語/巻き戻しの残骸
            qDirty = true; sfMarked = true;
            return;
          }
          if (e.sf) return;                         // 再観測(noteAppear)されるまで自動復活させない
          if (castPartOwner(n)) return;             // 登録キャラの名だけ呼び=分身
        }
        if (e.seen.length >= 3 && (cur - (e.last || 0)) <= 5) out.push({ name: n, last: e.last || 0 });
      });
      out.sort(function(a, b){ return b.last - a.last; });
      /* sf を立てたら永続化する(次回起動でも「再観測まで注入禁止」を維持するため)。
         台帳は物語データではない別キーなのでここでの書き込みは安全。 */
      if (sfMarked) saveQ();
    } catch(e){}
    return out;
  }

  // ---- fix277: sys後処理(状態ブロックの窓制御 + 準登録の許可行) ----
  var HEAD = '【各キャラの現在の状態';
  function surgery(sys){
    try {
      if (offQ() || typeof sys !== 'string' || !sys) return sys;
      var cast = castNames();
      var rec = quasiRecent();
      var qNames = rec.map(function(r){ return r.name; }).slice(0, 8);
      var lastOf = {}; rec.forEach(function(r){ lastOf[r.name] = r.last; });
      var permit = qNames.length
        ? '・準登録(自動・直近登場): ' + qNames.join('、') + ' — これらの人物も登場中は<say who="名前">と<state who="名前">を必ず出す(状態は引き継ぎ対象)。'
        : '';
      var hi = sys.indexOf(HEAD);
      if (hi < 0){
        return permit ? (sys + '\n\n【準登録キャラ(自動)】\n' + permit) : sys;
      }
      var lines = sys.split('\n');
      var h = -1;
      for (var i = 0; i < lines.length; i++){ if (lines[i].indexOf(HEAD) >= 0){ h = i; break; } }
      if (h < 0) return sys;
      var changed = false, qLines = [], out = lines.slice(0, h + 1);
      var j = h + 1;
      for (; j < lines.length; j++){
        var ln = lines[j];
        if (ln.charAt(0) !== '・') break; /* ブロック終端 */
        var em = ln.match(/^・(.+?)｜/);
        if (!em){ out.push(ln); continue; } /* 助言行はそのまま */
        var nm = em[1];
        if (cast.indexOf(nm) >= 0){ out.push(ln); continue; }
        if (qNames.indexOf(nm) >= 0){
          var cl = ln.length > 126 ? (ln.slice(0, 124) + '…') : ln; /* 1人120字級に圧縮 */
          if (cl !== ln) changed = true;
          qLines.push({ nm: nm, ln: cl });
          continue;
        }
        changed = true; /* キャスト外かつ準登録(直近)でない状態行は注入しない(肥大・汚染ガード) */
      }
      /* 準登録の合計600字ガード: 最終登場が古い順に切る */
      qLines.sort(function(a, b){ return (lastOf[b.nm] || 0) - (lastOf[a.nm] || 0); });
      var budget = 600, kept = [];
      qLines.forEach(function(q){ if (budget - q.ln.length >= 0){ budget -= q.ln.length; kept.push(q.ln); } else { changed = true; } });
      if (kept.length){
        /* 状態行のすぐ後(助言行の前)に入れたいが、構造単純化のためブロック末尾に追加 */
        out = out.concat(kept);
        changed = true;
      }
      if (permit){ out.push(permit); changed = true; }
      if (!changed) return sys; /* 無変更ならバイト一致で返す(回帰=sysバイト比較を保証) */
      return out.concat(lines.slice(j)).join('\n');
    } catch(e){ return sys; }
  }

  // ---- parsePlanラップ(登場収穫) ----
  function installParse(){
    try {
      var P = window.Planner || (typeof Planner !== 'undefined' ? Planner : null);
      if (!P || typeof P.parsePlan !== 'function') return false;
      if (P.parsePlan.__v292Dfix277q) return true;
      var inner = P.parsePlan.bind(P);
      var wrapped = function(rawText, inputType){
        var plan = inner(rawText, inputType);
        try {
          if (!offQ()){
            var S = getS();
            harvestRaw(rawText, (S && S.turns) ? S.turns.length : 0);
            detectSelfNaming(rawText, (S && S.turns) ? S.turns.length : 0);   // ★fix537
            detectPrenameWhoTransition(rawText, (S && S.turns) ? S.turns.length : 0);   // ★fix537pt(既定 OFF・既存 wrapper 内・新 wrapper 0)
            saveQ();
          }
        } catch(e){}
        return plan;
      };
      try { Object.keys(P.parsePlan).forEach(function(k){ if (k.indexOf('__') === 0) wrapped[k] = P.parsePlan[k]; }); } catch(e){} /* 旧フラグ継承(fix274と同思想・再ラップ輪の予防) */
      wrapped.__v292Dfix277q = true;
      P.parsePlan = wrapped;
      try { console.log(TAG, 'parsePlan wrapped (登場収穫)'); } catch(e){}
      return true;
    } catch(e){ return false; }
  }

  // ---- Planner.buildラップ(sys後処理・最外=fix192の上) ----
  function engineOn(){
    try { if (window.__v292NewEngine && typeof window.__v292NewEngine.engineOn === 'function') return !!window.__v292NewEngine.engineOn(); } catch(e){}
    try { var S = getS(); if (S && S.cfg && S.cfg.engineMode != null) return +S.cfg.engineMode === 1; return localStorage.getItem('v292EngineMode') === '1'; } catch(e){ return false; }
  }
  function installBuild(){
    try {
      var P = window.Planner || (typeof Planner !== 'undefined' ? Planner : null);
      if (!P || typeof P.build !== 'function') return false;
      if (P.build.__v292Dfix277b2) return true;
      var inner = P.build.bind(P);
      var wrapped = function(mode, text){
        var r = inner(mode, text);
        try {
          if (r && typeof r.sys === 'string' && engineOn() && !offQ()){
            syncConv(); mergeAliasStates(); saveQ();
            r.sys = surgery(r.sys);
          }
        } catch(e){}
        return r;
      };
      try { Object.keys(P.build).forEach(function(k){ if (k.indexOf('__') === 0) wrapped[k] = P.build[k]; }); } catch(e){} /* fix274のsetterも継承するが二重の保険 */
      wrapped.__v292Dfix277b2 = true;
      P.build = wrapped;
      try { console.log(TAG, 'Planner.build wrapped (準登録注入)'); } catch(e){}
      return true;
    } catch(e){ return false; }
  }
  (function waitP(){
    var a = installParse();
    /* buildラップは「fix192(新エンジン)のラップ装着後」まで待つ: 先に装着するとfix192が後から外側に来て
       r.sys=buildSys()がsurgery結果を上書きする(実機で実証)。fix274セッターがフラグを継承するため
       見かけ上は装着済みに見える罠。__v292NewEngineフラグの出現=fix192装着済みの権威。30秒で諦め装着(旧エンジン運用等)。 */
    var P = window.Planner || (typeof Planner !== 'undefined' ? Planner : null);
    waitP._n = (waitP._n || 0) + 1;
    var ready = P && typeof P.build === 'function' && (P.build.__v292NewEngine || waitP._n > 60);
    var b = ready ? installBuild() : false;
    if (a && b) return;
    setTimeout(waitP, 500);
  })();

  // ---- fix278: キャラ一覧アイコンの会話ログ統一 + fix277b別名カード統合 ----
  function unifyCards(){
    try {
      if (offI() && offA()) return;
      var cards = document.querySelectorAll('.v292Dfix145-card');
      if (!cards.length) return;
      var f197 = window.__v292Dfix197;
      var names = {};
      cards.forEach(function(c){ names[c.getAttribute('data-name') || ''] = 1; });
      cards.forEach(function(card){
        var nm = card.getAttribute('data-name') || '';
        if (!nm) return;
        /* fix277b: 別名カードは正名カードがあれば非表示(表示統合のみ・データは残す) */
        if (!offA()){
          var canon = aliasFix(nm);
          if (canon !== nm && names[canon]){ card.style.display = 'none'; return; }
        }
        /* fix278: 会話ログと同じ v292av2_ キャッシュ(名前+画風)を最優先 */
        if (offI() || !f197 || typeof f197.cachedFor !== 'function') return;
        var url = f197.cachedFor(nm) || f197.cachedFor(aliasFix(nm));
        if (!url) return; /* キャッシュ未生成→従来経路のまま */
        var img = card.querySelector('img');
        if (img){
          if (img.getAttribute('src') !== url){ img.onerror = null; img.src = url; }
        } else {
          var wrap = card.firstChild;
          if (wrap && wrap.nodeType === 1){
            wrap.textContent = '';
            var ni = document.createElement('img');
            ni.src = url; ni.alt = nm;
            ni.style.cssText = 'width:100%; height:100%; object-fit:cover;';
            wrap.appendChild(ni);
          }
        }
      });
    } catch(e){}
  }
  var moT = null;
  try {
    new MutationObserver(function(muts){
      var hit = false;
      for (var i = 0; i < muts.length && !hit; i++){
        var ad = muts[i].addedNodes || [];
        for (var k = 0; k < ad.length; k++){
          var nd = ad[k];
          if (nd && nd.nodeType === 1 && ((nd.className || '').indexOf('v292Dfix145') >= 0 || (nd.querySelector && nd.querySelector('.v292Dfix145-card')))){ hit = true; break; }
        }
      }
      if (!hit) return;
      if (moT) clearTimeout(moT);
      moT = setTimeout(function(){ moT = null; unifyCards(); }, 250);
    }).observe(document.documentElement || document.body, { childList: true, subtree: true });
  } catch(e){}

  /* ★fix541(2026-07-25・GPT裁定の第2段階): 「別個体を1つのハブへ束ねた疑いのある台帳エントリ」を
       **検出だけ**する。**削除も統合停止もしない**(この版は読取専用の診断)。
     由来: 実セーブ 廃墟21T `smrrcv21iph` の `怪異.ali = ["長身の怪異","孤児院の怪異"]`。
       別々に描写された2体を1つの「怪異」へ束ねている疑いがある。
       おしんの明示指示「**類似している別個体まで強制統合しない**」に直結する。
     GPTの警告: 「一般名詞で終わる正名 + 修飾つき別名が2つ以上」は**候補抽出には有効だが
       自動削除条件としては乱暴**(少女/白い服の少女/門前にいた少女 は普通に同一人物)。
       よって2段階に分け、第2段階の「別個体の証拠」で危険度を上げるだけにする。
     読出: window.__v292QuasiPack.ambiguousHubs() */
  var GENERIC_HUB = /(怪異|少女|少年|女|男|子供|子ども|影|人影|老人|老婆|青年|婦人|女将|店主|主人|店員|医者|警官|教師|生徒|客|男性|女性)$/;
  function ambiguousHubs(){
    var out = [];
    try {
      var qs = loadQ(), cast = castNames();
      var S = getS(), turns = (S && Array.isArray(S.turns)) ? S.turns : [];
      Object.keys(qs).forEach(function(canon){
        var e = qs[canon]; if (!e) return;
        var ali = (e.ali || []).filter(function(a){ return a && a !== canon; });
        /* --- 第1段階: 構造的な疑わしさ --- */
        if (ali.length < 2) return;                         /* 入ってくる別名が2件以上 */
        if (cast.indexOf(canon) >= 0) return;               /* 登録キャストは対象外 */
        if (!GENERIC_HUB.test(canon)) return;               /* 正名が一般呼称・役割名 */
        if (canon.length > 6) return;                       /* 「短い」の目安 */
        var modified = ali.filter(function(a){ return a.length > canon.length && a.indexOf(canon) >= 0; });
        if (modified.length < 2) return;                    /* 別名がそれぞれ修飾語付き */
        /* --- 第2段階: 別個体の証拠(あれば危険度を上げる。無くても候補には残す) --- */
        var ev = [];
        /* (1) 2つの呼称が同一ターンで別々に会話カードの話者として並存する */
        for (var i = 0; i < turns.length; i++){
          var who = {};
          ((turns[i] && turns[i]._convSays) || []).forEach(function(c){ if (c && c.who) who[c.who] = 1; });
          var n = 0; ali.forEach(function(a){ if (who[a]) n++; });
          if (n >= 2){ ev.push('same-turn-both-speak:T' + (i + 1)); break; }
        }
        /* (2) 明示的な分離表現が本文にある */
        for (var j = 0; j < turns.length; j++){
          var txt = String((turns[j] && turns[j].narrative && turns[j].narrative.join)
                    ? turns[j].narrative.join('\n') : ((turns[j] && turns[j].narrative) || ''));
          if (!txt) continue;
          var hitA = 0; ali.forEach(function(a){ if (txt.indexOf(a) >= 0) hitA++; });
          if (hitA >= 2 && /(もう一(体|人|匹)|別の|二(体|人)|片方|双方|それぞれ|両方)/.test(txt)){
            ev.push('explicit-separation:T' + (j + 1)); break;
          }
        }
        /* (3) 登場ターンが重なる(各々が別々に継続観測される) */
        var spans = {};
        ali.forEach(function(a){ var ae = qs[a]; if (ae && Array.isArray(ae.seen) && ae.seen.length) spans[a] = ae.seen; });
        var keys = Object.keys(spans);
        if (keys.length >= 2){
          for (var x = 0; x < keys.length; x++) for (var y = x + 1; y < keys.length; y++){
            var A = spans[keys[x]], B = spans[keys[y]];
            var overlap = A.filter(function(v){ return B.indexOf(v) >= 0; });
            if (overlap.length){ ev.push('overlapping-turns:' + keys[x] + '/' + keys[y]); x = keys.length; break; }
          }
        }
        out.push({ status: 'ambiguous-hub', canonical: canon, aliases: ali,
                   modifiedAliases: modified, evidence: ev,
                   risk: ev.length ? 'high' : 'suspect',
                   action: 'review-only' });   /* この版では停止措置は取らない */
      });
    } catch(e){}
    return out;
  }

  window.__v292QuasiPack = {
    store: loadQ, key: QK, surgery: surgery, aliasMap: aliasMap, aliasFix: aliasFix,
    noteAppear: noteAppear, quasiRecent: quasiRecent, syncConv: syncConv, unifyCards: unifyCards,
    detectSelfNaming: detectSelfNaming, /* ★fix537 検証口(実経路はparsePlanラップ) */
    detectPrenameWhoTransition: detectPrenameWhoTransition, fix537PtDiag: ptDiag,   /* ★fix537pt 検証口と非永続診断口 */
    fix537SlotLog: hlsRead, fix537SlotLogDiag: hlsDiag,   /* ★HOT_LOG_SLOT_ATTRIBUTION v1 の唯一の READ 経路と診断口(読むだけ) */
    normalizeConvWho: normalizeConvWho,   /* ★fix538 検証口 */
    ambiguousHubs: ambiguousHubs,         /* ★fix541 検出のみ・停止措置なし */
    _dropCache: function(){ qStore = null; qKeyLoaded = ''; aliasCache = null; }, /* 検証用 */
    addAlias: function(canonical, alias){
      try { var qs = loadQ(); var e = qs[canonical] || { seen: [], ali: [] }; if ((e.ali = e.ali || []).indexOf(alias) < 0) e.ali.push(alias); qs[canonical] = e; qDirty = true; saveQ(); aliasCache = null; return true; } catch(e2){ return false; }
    }
  };
  try { console.log(TAG, 'loaded (fix277/277b/278)'); } catch(e){}
})();
