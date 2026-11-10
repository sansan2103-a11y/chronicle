/* =====================================================================
 * v292DfixAGENCY1-player-intent.js — SAY/DO の回に「入力されていない主人公の意図・発話内容を確定しない」1 文（★AGENCY1・GPT #127-RS ②・2026-11-10・Local 候補）
 * ---------------------------------------------------------------------
 * ■なぜ
 *   Owner 実プレイ（2026-11-10）: 主人公「面白いことしない？」→ 誘われた側の NPC が誘いの中身（旧校舎の噂）を自分の台詞で言った。
 *   fix417:48（主人公の内面・台詞・意図は決めない）と、前へ進める・NPC は自分から喋る指示（fix192:874・fix459【展開】・fix440:76/81・
 *   fix192:180-182・fix235）がぶつかり、主人公の番の中身を NPC が埋めた（#127-RR §3・確度 中〜高）。
 * ■やること（GPT #127-RS ② 修正版 A。文面は採用文のまま・変えない）
 *   fix192 buildSys の SAY/DO の入力説明の行（【プレイヤー入力＝主人公の発話】／【プレイヤー入力＝主人公の行動】）の末尾に、次の 1 文を足す:
 *     入力されていない主人公の意図・発話内容を勝手に確定しない。NPCは自分の知識や関心から質問・推測・提案してよいが、
 *     それを主人公が元から考えていた内容として扱わず、主人公の次の選択を残す。
 *   足す場所は fix192 の 1 行の呼び出し（window.__v292DfixAGENCY1.suffix(m, inputLine)）。このファイルは文を返すかどうかだけを決める。
 *   ・この SAY/DO の文（TEXT）は STORY・「続きを書く」・オート⏩には足さない（STORY 側は別の文 TEXT_STORY。下の AGENCY1b）。
 *   ・見出しを持たない文を、fix459 の既存の登録見出しのブロック（入力説明の行）の中に足すだけ＝fix459 の MARKERS 変更は要らない。
 *     fix459 はこの 2 つの見出しを落とさない（dropA/B/C/D に無い）ので、組み替え後も同じブロックに残る。
 *   ・fix235 の 8 文書き直しは変えない（書き直しは同じ sys を使うので文はそのまま付いていく）。
 *   ・B38-a（既定 OFF）が ON のときは B38-a の文の後ろに続く（両方とも「入力外の主人公の発話を足さない」側で、食い違わない）。
 * ■範囲（既定 = 影モード。Worker は変えない）
 *   kill   v292DfixAGENCY1Off='1' … 何もしない（文を返さない・記録もしない＝854cb71 と送信がバイト一致）
 *   Vault  fix889 で隠した物語（KN1・LORE1 と同じ判定・fix889 が無い/例外は隠した扱い＝fail-closed）… 足さない・記録もしない
 *   ON     端末キー v292DfixAGENCY1On='1'、または ADMF1 が鍵 'agency1' を知っていて gate('agency1') が true … 足す
 *   影     それ以外（既定。ADMF1 が無い・古い ADMF1〔鍵 'agency1' を知らない〕・答え待ち・行なしを含む）… 足すはずだった事実だけ記録し、文は返さない
 * ■AGENCY1b（Owner 決定 2026-11-10 17:12 案 A・同じファイルの版上げ agency1-20261110-b）
 *   STORY（場面の方向づけ）と「続きを書く」・オート⏩にも 1 文を足す（文は TEXT_STORY）。方向づけの行の末尾（fix192 の suffix 呼び出しを STORY にも）と、
 *   続き・オート（入力説明の行が無い）は fix192 が blocks に 1 ブロックとして置く（contSentence）。判断（影・kill・Vault・gate・端末 On）は SAY/DO と同じ。
 *   版 B（短いひと言までは許す）: 端末キー v292DfixAGENCY1StoryMode='B'（既定 A）。A/B 比較用で、どちらの版も同じ場所・同じ判断。
 *   STORY 腕だけ止める kill: v292DfixAGENCY1StoryOff='1'（SAY/DO は変わらない）。全体の kill v292DfixAGENCY1Off='1' は両方止める。
 * ■診断（本文・入力文・物語 ID は残さない）: window.__v292DfixAGENCY1.status()
 *   last（最後の判断）・lastSend（送信前の sys にこの文が何回あったか・fix459 の見ではどの見出しのブロックか）・stats（回数だけ。story の送信数・書き直しの送信数を含む）
 * ===================================================================== */
(function () {
  'use strict';
  if (window.__v292DfixAGENCY1) return;
  var VER = 'agency1-20261110-c';
  var TAG = '[v292DfixAGENCY1:player-intent]';
  var KILL = 'v292DfixAGENCY1Off', ON = 'v292DfixAGENCY1On', KEY = 'agency1', STORY_OFF = 'v292DfixAGENCY1StoryOff';
  /* ★AGENCY1c（GPT #127-RU ②）: 3 つの文（TEXT／TEXT_STORY／TEXT_STORY_B）すべての直後に続けて足す 1 文（文面は裁定のまま・1 回だけ）。 */
  var SENT_FACT = 'NPCが主人公の過去の発言・決定を事実として述べる場合は、既存の記録に基づく。根拠のない推測や嘘はNPC自身の認識として扱い、確定した事実にしない。';
  var TEXT = '入力されていない主人公の意図・発話内容を勝手に確定しない。NPCは自分の知識や関心から質問・推測・提案してよいが、それを主人公が元から考えていた内容として扱わず、主人公の次の選択を残す。' + SENT_FACT;
  /* ★AGENCY1b（Owner 決定 2026-11-10 17:12 案 A）: STORY（場面の方向づけ）と「続きを書く」・オート⏩の回にも、主人公の台詞を AI に書かせない 1 文。
     文面は Owner 案のまま。SAY/DO の文（TEXT）とは別の文で、同じ回に両方が付くことはない（SAY/DO の回は STORY の文を付けない）。 */
  var TEXT_STORY = 'プレイヤーが台詞を入力していないターンでは、主人公の台詞（「」）を書かない。主人公は表情・視線・小さな動作などの描写にとどめ、言葉はプレイヤーに残す。' + SENT_FACT;
  /* 版 B（統括追加・Owner「ゲームとしての質が最優先で、A は必須ではない」）: A/B 比較用。端末キー v292DfixAGENCY1StoryMode='B' で切り替え（既定は A）。 */
  var TEXT_STORY_B = 'プレイヤーが台詞を入力していないターンでは、主人公の台詞は短いひと言の反応（10字程度まで）にとどめ、新しい提案・決定・情報を主人公に言わせない。' + SENT_FACT;
  var STORY_MODE = 'v292DfixAGENCY1StoryMode';
  function storyMode() { return lsGet(STORY_MODE) === 'B' ? 'B' : 'A'; }
  function storyText() { return storyMode() === 'B' ? TEXT_STORY_B : TEXT_STORY; }
  var MK_SAY = '【プレイヤー入力＝主人公の発話】', MK_DO = '【プレイヤー入力＝主人公の行動】', MK_DIR = '【プレイヤー入力＝場面の方向づけ】';
  var RW = '【重要・書き直し】';   /* index.html fix216/235 の書き直しの user に付く見出し（数えるだけ） */

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function killed() { return lsGet(KILL) === '1'; }
  function storyOff() { return lsGet(STORY_OFF) === '1'; }   /* STORY 腕だけ止める（SAY/DO の腕は変わらない） */
  function sid() { try { var f = window.__v292Dfix697; var s = f && f.status ? f.status().storyId : null; return s ? String(s) : null; } catch (e) { return null; } }
  function vaultHidden(id) { try { var V = window.__v292Dfix889; if (!V || typeof V.isHidden !== 'function') return true; return !!V.isHidden(id); } catch (e) { return true; } }   /* KN1・LORE1 と同じ・fail-closed */
  function admfKnown() { try { var X = window.__v292DfixADMF1; return !!(X && typeof X.keys === 'function' && typeof X.gate === 'function' && X.keys().indexOf(KEY) >= 0); } catch (e) { return false; } }
  function admfOn() { try { if (!admfKnown()) return false; return window.__v292DfixADMF1.gate(KEY, false) === true; } catch (e) { return false; } }   /* 読めない・古い ADMF1 → false（＝影） */
  function mode() {
    if (killed()) return 'kill';
    var id = sid(); if (id && vaultHidden(id)) return 'vault';
    if (lsGet(ON) === '1') return 'on';
    if (admfOn()) return 'on';
    return 'shadow';
  }
  function b38a() { try { return lsGet('v292DfixB38Off') !== '1' && lsGet('v292DfixB38aOn') === '1'; } catch (e) { return false; } }

  var stats = { calls: 0, added: 0, shadow: 0, kill: 0, vault: 0, notSayDo: 0, already: 0, errors: 0, sendSeen: 0, sendDup: 0, sendNotInInput: 0, storySends: 0, rewriteSends: 0,
    stCalls: 0, stAdded: 0, stShadow: 0, stOff: 0, stAlready: 0, stSeen: 0, stDup: 0, stNotHead: 0, stDirAdded: 0, stContAdded: 0 };
  var LAST = null, LASTSEND = null;

  function line0(x) { return String(x || ''); }
  /* ★AGENCY1b の STORY 腕。sub = 'dir'（方向づけの行の末尾）／'cont'（続き・オート。入力説明の行が無いので fix192 が別のブロックとして置く）。 */
  function storyArm(sub, md, line) {
    try {
      if (storyOff()) { stats.stOff++; LAST = { at: Date.now(), mode: md, arm: 'story', sub: sub, added: false, why: 'story-off' }; return ''; }
      if (sub === 'dir' && line.indexOf(MK_DIR) !== 0) { stats.notSayDo++; LAST = { at: Date.now(), mode: md, arm: 'story', sub: sub, added: false, why: 'no-input-line' }; return ''; }
      if (line.indexOf(TEXT_STORY) >= 0 || line.indexOf(TEXT_STORY_B) >= 0) { stats.stAlready++; LAST = { at: Date.now(), mode: md, arm: 'story', sub: sub, added: false, why: 'already' }; return ''; }
      stats.stCalls++;
      var d = { kind: 'STORY', sub: sub, variant: storyMode(), b38a: b38a(), lineLen: line.length, addLen: storyText().length };
      if (md === 'shadow') { stats.stShadow++; LAST = { at: Date.now(), mode: md, arm: 'story', sub: sub, added: false, would: true, d: d }; return ''; }
      stats.stAdded++; if (sub === 'cont') stats.stContAdded++; else stats.stDirAdded++;
      LAST = { at: Date.now(), mode: md, arm: 'story', sub: sub, added: true, d: d };
      return storyText();
    } catch (e) { stats.errors++; LAST = { at: Date.now(), mode: 'error' }; return ''; }
  }
  /* fix192 buildSys が「続きを書く」・オート⏩（入力説明の行が無い回）で、blocks に 1 ブロックとして足す文を聞く。'' なら何も足さない。 */
  function contSentence(m) {
    try {
      var md = mode();
      if (md === 'kill') { stats.kill++; LAST = { at: Date.now(), mode: md }; return ''; }
      if (md === 'vault') { stats.vault++; LAST = { at: Date.now(), mode: md }; return ''; }
      return storyArm('cont', md, '');
    } catch (e) { stats.errors++; return ''; }
  }

  /* fix192 buildSys が SAY/DO の入力説明の行を作った直後に 1 回呼ぶ。返した文字列を行の末尾に足す（'' なら何も足さない）。 */
  function suffix(m, inputLine) {
    try {
      var md = mode();
      if (md === 'kill') { stats.kill++; LAST = { at: Date.now(), mode: md }; return ''; }
      if (md === 'vault') { stats.vault++; LAST = { at: Date.now(), mode: md }; return ''; }   /* 何をしたかも残さない */
      var k = String(m || '').toUpperCase();
      if (k === 'STORY') return storyArm('dir', md, line0(inputLine));   /* ★AGENCY1b: 場面の方向づけの行の末尾（SAY/DO の calls には数えない） */
      stats.calls++;
      if (k !== 'SAY' && k !== 'DO') { stats.notSayDo++; LAST = { at: Date.now(), mode: md, kind: k || null, added: false, why: 'not-say-do' }; return ''; }
      var line = String(inputLine || '');
      var mk = k === 'SAY' ? MK_SAY : MK_DO;
      if (line.indexOf(mk) !== 0) { stats.notSayDo++; LAST = { at: Date.now(), mode: md, kind: k, added: false, why: 'no-input-line' }; return ''; }
      if (line.indexOf(TEXT) >= 0) { stats.already++; LAST = { at: Date.now(), mode: md, kind: k, added: false, why: 'already' }; return ''; }   /* 1 回だけ */
      var d = { kind: k, b38a: b38a(), lineLen: line.length, addLen: TEXT.length };
      if (md === 'shadow') { stats.shadow++; LAST = { at: Date.now(), mode: md, added: false, would: true, d: d }; return ''; }
      stats.added++; LAST = { at: Date.now(), mode: md, added: true, d: d };
      return TEXT;
    } catch (e) { stats.errors++; LAST = { at: Date.now(), mode: 'error' }; return ''; }
  }

  /* ---- 送信前の sys を読むだけ（Api._preCallHooks。何も返さない＝送る中身は変えない） ---- */
  function countOf(h, n) { var c = 0, k = 0; while ((k = h.indexOf(n, k)) >= 0) { c++; k += n.length; } return c; }
  function blockOf(sys, needle) {   /* fix459 の parse（純粋）で、この文がどの見出しのブロックにあるか（'head' = 最初の見出しより前） */
    try { var F = window.__v292Dfix459; if (!F || typeof F.parse !== 'function') return null;
      var at = sys.indexOf(needle || TEXT); if (at < 0) return null;
      var bl = (F.parse(sys) || {}).blocks || [], j;
      for (j = 0; j < bl.length; j++) { if (bl[j].at <= at && at < bl[j].end) return bl[j].mk; }
      return 'head'; } catch (e) { return null; }
  }
  function preHook(ctx) {
    try {
      if (!ctx || typeof ctx.system !== 'string') return;
      if (killed()) return;
      var id = sid(); if (id && vaultHidden(id)) return;
      var sys = ctx.system;
      var isStory = sys.indexOf('【プレイヤー入力＝') >= 0 || /続きを(?:自然に)?進めて/.test(String(ctx.userContent || ''));
      if (!isStory) return;
      stats.storySends++;
      if (typeof ctx.userContent === 'string' && ctx.userContent.indexOf(RW) >= 0) stats.rewriteSends++;
      var ns = countOf(sys, TEXT_STORY) + countOf(sys, TEXT_STORY_B), stVar = countOf(sys, TEXT_STORY_B) ? 'B' : (countOf(sys, TEXT_STORY) ? 'A' : null);   /* ★AGENCY1b: STORY 腕の文（見るだけ） */
      var stBlock = null;
      if (ns) { stats.stSeen++; if (ns > 1) stats.stDup++; stBlock = blockOf(sys, stVar === 'B' ? TEXT_STORY_B : TEXT_STORY); if (stBlock !== 'head' && stBlock !== null) stats.stNotHead++; }
      var n = countOf(sys, TEXT);
      if (!n) { LASTSEND = { at: Date.now(), count: 0, story: ns, storyVar: stVar, storyBlock: stBlock, sysLen: sys.length }; return; }
      stats.sendSeen++; if (n > 1) stats.sendDup++;
      var mk = blockOf(sys);
      var inInput = (mk === MK_SAY || mk === MK_DO);
      if (mk !== null && !inInput) stats.sendNotInInput++;
      LASTSEND = { at: Date.now(), count: n, story: ns, storyVar: stVar, storyBlock: stBlock, block: mk === MK_SAY ? 'SAY' : mk === MK_DO ? 'DO' : (mk ? 'other' : null), sysLen: sys.length };
    } catch (e) {}
  }
  preHook.__agency1 = true;
  var hookInstalled = false;
  function installHook() {
    try { var A = window.Api || (0, eval)('typeof Api!=="undefined" ? Api : null'); if (!A || !Array.isArray(A._preCallHooks)) return false;
      for (var i = 0; i < A._preCallHooks.length; i++) { if (A._preCallHooks[i] && A._preCallHooks[i].__agency1) { hookInstalled = true; return true; } }
      A._preCallHooks.push(preHook); hookInstalled = true; return true; } catch (e) { return false; }
  }
  installHook();
  var _iv = 0; try { _iv = setInterval(function () { if (installHook()) { clearInterval(_iv); } }, 2000); } catch (e) {}

  window.__v292DfixAGENCY1 = {
    ver: VER, text: TEXT, textStory: TEXT_STORY, textStoryB: TEXT_STORY_B, suffix: suffix, contSentence: contSentence, mode: mode,
    status: function () {
      return { ver: VER, mode: mode(), killed: killed(), storyOff: storyOff(), storyMode: storyMode(), on: lsGet(ON) === '1', admfKnown: admfKnown(), admf: admfOn(), b38a: b38a(), hookInstalled: hookInstalled,
        last: LAST ? JSON.parse(JSON.stringify(LAST)) : null, lastSend: LASTSEND ? JSON.parse(JSON.stringify(LASTSEND)) : null, stats: JSON.parse(JSON.stringify(stats)) };
    }
  };
  try { console.log(TAG, 'armed (mode=' + mode() + ')'); } catch (e) {}
})();
