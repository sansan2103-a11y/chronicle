// =====================================================================
// Chronicle TRPG — v292Dfix135+136+137: Long-term memory
//
//   fix135 Auto-Summary  — keep a rolling "story so far" (~300 chars)
//   fix136 Auto-WorldInfo— auto-extracted cast/place/object DB
//   fix137 Event Timeline— time-stamped key events (death/escape/...)
//
//   All three are produced by ONE LLM call every REBUILD_INTERVAL turns
//   (cost minimization). Results are persisted to localStorage and
//   exposed via window.__longmem.* for features.js's build-wrap to
//   read and inject into sys.
//
//   Designed to match (and arguably surpass) AI Dungeon's World Info /
//   Memory mechanics by being fully AUTOMATIC — no manual user upkeep.
//   fix299(2026-06-16): longmemが全スロット未永続化の根治。①保存ゲートからdocument.hidden除去
//     (前面で始めた要約を背景化後も保存) ②初回バックログ上限12T(巨大プロンプトのtimeout回避)
//     ③timeout 45s→90s ④要約モデルをFlash固定(速/安) ⑤focus/visibilitychangeでcatch-up
// =====================================================================
(function v292Dfix135(){
  'use strict';
  if (window.__v292Dfix135) return;
  window.__v292Dfix135 = true;
  /* fix299b: cross-slot summarize guard active */

  var TAG = '[v292Dfix135:longmem]';
  var LSP_SUMMARY   = 'chr6_v292Dfix135_sum';
  var LSP_WORLDINFO = 'chr6_v292Dfix136_wi';
  var LSP_EVENTS    = 'chr6_v292Dfix137_ev';
  var LSP_LASTBUILD = 'chr6_v292Dfix135_last';

  var REBUILD_INTERVAL = 3;          // v292Dfix152-A: 5→3 for fresher char state (death/injury reflected within 3 turns)
  var ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

  function getModel(){
    // fix299: 要約は背景タスク。軽量・高速・安価な Flash を優先(物語モデルがProでも要約はFlashで速く確実に)。
    return 'deepseek/deepseek-v4-flash';
  }
  function getKey(){
    try { var c = JSON.parse(localStorage.getItem(window.__chr6Key ? window.__chr6Key() : 'chr6') || '{}').cfg || {}; return c.orKey || ''; } catch(e){ return ''; }
  }
  function getState(){
    try { if (typeof S !== 'undefined' && S) return S; } catch(e){}
    return window.S || null;
  }
  // ★fix299b: スロット厳密化用ヘルパ(fix307eと同型)。
  function slotSfx(){ try { if (typeof window.__chr6Key === 'function'){ var k = window.__chr6Key(); return (k && k !== 'chr6') ? k.replace(/^chr6/, '') : ''; } } catch(e){} return ''; }
  function slotBlobLoc(sfx){ try { var b = JSON.parse(localStorage.getItem('chr6' + sfx) || 'null'); return (b && b.scene) ? (b.scene.loc || null) : null; } catch(e){ return null; } }

  // ---------- v292Dfix170D2: single-writer ガード ----------
  // 背景(非表示)タブ・古い世代(epoch)のタブは longmem を書かない。これで「裏で開いた
  // 古い状態のタブのポーラが worldinfo を書き戻してリセットを巻き戻す」clobberを防ぐ。
  // 書くのは前面かつ最新epochのタブだけ＝single-writer。読み込みは常に許可。
  function _lmCanWrite(){
    try {
      if (typeof document !== 'undefined' && document.hidden) return false;        // 背景タブは書かない
      var ep = +(localStorage.getItem('chr6_epoch') || 0);
      if (window.__chrEpoch && ep > window.__chrEpoch) return false;               // 別タブがreset済=stale
    } catch(e){}
    return true;
  }
  // fix299: 保存専用ゲート。epoch(単一writer)だけを見る。document.hiddenは見ない
  //   = 前面で始めた要約の結果を、応答到着時にタブが背景化していても保存できる
  //   (ユーザーが20-40秒の生成中に別タブへ移ると結果が捨てられていた根本問題の解消)。
  function _lmCanSave(){
    try { var ep = +(localStorage.getItem('chr6_epoch') || 0); if (window.__chrEpoch && ep > window.__chrEpoch) return false; } catch(e){}
    return true;
  }

  // ---------- storage ----------
  function loadSummary(){ try { return localStorage.getItem(LSP_SUMMARY) || ''; } catch(e){ return ''; } }
  function saveSummary(s){ if(!_lmCanSave())return; try { localStorage.setItem(LSP_SUMMARY, String(s || '').slice(0, 800)); } catch(e){} }
  function loadWorldInfo(){ try { return JSON.parse(localStorage.getItem(LSP_WORLDINFO) || '[]') || []; } catch(e){ return []; } }
  function saveWorldInfo(arr){ if(!_lmCanSave())return; try { localStorage.setItem(LSP_WORLDINFO, JSON.stringify((arr || []).slice(0, 40))); } catch(e){} }
  function loadEvents(){ try { return JSON.parse(localStorage.getItem(LSP_EVENTS) || '[]') || []; } catch(e){ return []; } }
  function saveEvents(arr){ if(!_lmCanSave())return; try { localStorage.setItem(LSP_EVENTS, JSON.stringify((arr || []).slice(0, 20))); } catch(e){} }
  function loadLastBuild(){ try { return parseInt(localStorage.getItem(LSP_LASTBUILD) || '-1', 10); } catch(e){ return -1; } }
  function saveLastBuild(idx){ if(!_lmCanSave())return; try { localStorage.setItem(LSP_LASTBUILD, String(idx)); } catch(e){} }

  // ---------- LLM call ----------
  function buildPrompt(prevSummary, prevWorldInfo, prevEvents, newTurns, startIdx){
    var newText = newTurns.map(function(t, i){
      var pt = (t.playerText || '').slice(0, 80);
      var nr = (t.narrative || '').slice(0, 1500);
      return '[Turn ' + (startIdx + i) + '] PLAYER: ' + pt + '\nNARR: ' + nr;
    }).join('\n\n');
    // v292Dfix245: セリフのタグ(_convSays.who)で既に確定している話者名を権威名として渡す。
    //   要約LLMが地の文から独自に別名(例:「黒髪の少女」)を coin するのを防ぎ、会話ログと
    //   キャラ一覧の名前を一致させる(同一人物に名前が2つ付く根本原因の解消)。
    var _authNames245 = {};
    try {
      (newTurns || []).forEach(function(t){ ((t && t._convSays) || []).forEach(function(c){ if (c && c.who && String(c.who).length <= 24) _authNames245[c.who] = 1; }); });
      (prevWorldInfo || []).forEach(function(w){ if (w && w.type === 'character' && w.name) _authNames245[w.name] = 1; });
    } catch(e){}
    var _authList245 = Object.keys(_authNames245);
    var _authBlock245 = 'AUTHORITATIVE CHARACTER NAMES (these exact names already identify characters in this story — dialogue speakers and known cast):\n' +
      (_authList245.length ? _authList245.map(function(n){ return '- ' + n; }).join('\n') : '(none)') + '\n' +
      'When a person in the narration is one of these, you MUST use that EXACT name. NEVER coin a new descriptive label (e.g. 黒髪の少女, 白いワンピースの少女) for someone already named above. One physical character = exactly ONE name.\n\n';
    return 'You analyze a Japanese ongoing horror TRPG to maintain long-term memory.\n\n' +
      'PREVIOUS SUMMARY:\n' + (prevSummary || '(none)') + '\n\n' +
      _authBlock245 +
      'KNOWN WORLD INFO:\n' + (prevWorldInfo.length ? prevWorldInfo.map(function(w){return '- ' + w.name + ' (' + w.type + '): ' + w.desc;}).join('\n') : '(none)') + '\n\n' +
      'KEY EVENTS:\n' + (prevEvents.length ? prevEvents.map(function(e){return '- T' + e.turnIdx + ' (importance ' + e.importance + '): ' + e.event;}).join('\n') : '(none)') + '\n\n' +
      'NEW TURNS:\n' + newText + '\n\n' +
      'Produce a FRESH analysis as JSON with these fields:\n' +
      '{\n' +
      '  "summary": "Japanese, 300 chars max. The story so far — plot, current situation, character states. Replace the previous summary.",\n' +
      '  "worldinfo": [ { "name": "Japanese name", "type": "character|place|object|concept", "desc": "1 sentence Japanese: who/what" } ],\n' +
      '  "events": [ { "turnIdx": number, "event": "1 line Japanese: a major event (death/escape/encounter/loss/key decision)", "importance": 1-3 (3=critical) } ]\n' +
      '}\n' +
      'Rules: Output ONLY the JSON. Update/replace previous summary entirely. Merge new worldinfo entries with old (no duplicates by name; reuse AUTHORITATIVE CHARACTER NAMES verbatim — do not create a second entry under a different label for the same person). Keep worldinfo <= 30 (drop least relevant). Keep events <= 15 (drop low-importance old ones). Use turnIdx values from the [Turn N] markers above.';
  }

  function call(prompt, cb){
    var key = getKey();
    if (!key){ cb(null); return; }
    var body;
    try {
      body = JSON.stringify({
        model: getModel(),
        temperature: 0.3,
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      });
    } catch(e){ cb(null); return; }
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', ENDPOINT, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Authorization', 'Bearer ' + key);
      xhr.timeout = 90000;
      xhr.onload = function(){
        if (xhr.status >= 200 && xhr.status < 300){
          try {
            var j = JSON.parse(xhr.responseText);
            var content = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
            cb(parse(content));
          } catch(e){ cb(null); }
        } else { cb(null); }
      };
      xhr.onerror   = function(){ cb(null); };
      xhr.ontimeout = function(){ cb(null); };
      xhr.send(body);
    } catch(e){ cb(null); }
  }

  function parse(text){
    if (!text) return null;
    var s = String(text), i = s.indexOf('{'), j = s.lastIndexOf('}');
    if (i < 0 || j < 0 || j < i) return null;
    try {
      var obj = JSON.parse(s.slice(i, j + 1));
      if (!obj || typeof obj !== 'object') return null;
      return {
        summary: String(obj.summary || '').slice(0, 800),
        worldinfo: Array.isArray(obj.worldinfo) ? obj.worldinfo.filter(function(w){ return w && w.name && w.type && w.desc; }).slice(0, 40) : [],
        events: Array.isArray(obj.events) ? obj.events.filter(function(e){ return e && e.event && typeof e.turnIdx === 'number'; }).slice(0, 20) : []
      };
    } catch(e){ return null; }
  }

  // ---------- rebuild check & trigger ----------
  var BUSY = false;
  function maybeRebuild(){
    if (BUSY) return;
    var st = getState();
    if (!st || !st.turns || !st.turns.length) return;
    var curTurn = st.turns.length - 1;
    // ★fix299b: スロット厳密化。要約の保存先キーは fix246 が「書込時のアクティブスロット」へ
    //   リダイレクトする。切替/起動の中間状態(キー=新スロット・S=前の物語)で要約を走らせ
    //   コールバックで保存すると、別スロットの longmem(あらすじ/worldinfo/events)に前の物語が
    //   混入する(fix307と同型・キャラ一覧とモデル文脈の両方を汚染)。開始時に「Sが今のスロットの
    //   物語か」を固定検証し、コールバックでも再確認する。
    var startSfx = slotSfx();
    var startLoc = (st.scene && st.scene.loc) || null;
    var startBlobLoc = slotBlobLoc(startSfx);
    if (startBlobLoc && startLoc && startBlobLoc !== startLoc) return; // 中間状態(S≠このスロット) → 触らない
    var lastBuild = loadLastBuild();
    // v292Dfix177: ターン数が前回ビルド時より減った = 物語リセット/新ゲーム開始。
    //   longmemは累積方式(前のworldinfo/eventsをLLMに渡して更新)なので、検出せずに放置すると
    //   前ゲームのキャラ・出来事(例: 白い手/ミリアが襲われる/存在しないT2のevent)が引き継がれ続け、
    //   キャラ一覧にリセット前の残骸が出る。縮小を検出したら前データをクリアして新ゲームから作り直す。
    if (lastBuild >= 0 && curTurn < lastBuild && _lmCanWrite()){
      try { console.log(TAG, 'turn count regressed (cur ' + curTurn + ' < built ' + lastBuild + ') — reset/new game detected, clearing stale long-mem'); } catch(_){}
      reset();
      lastBuild = -1;
    }
    if (curTurn < 2) return;                                  // need at least 3 turns
    if (lastBuild >= 0 && curTurn - lastBuild < REBUILD_INTERVAL) return;
    BUSY = true;
    var prevSum = loadSummary();
    var prevWI  = loadWorldInfo();
    var prevEv  = loadEvents();
    var startIdx = lastBuild + 1;
    // fix299: 初回(lastBuild<0)に大量ターンが溜まっていると全要約で巨大プロンプト→タイムアウト永久失敗。
    //   直近FIRST_CAPターンだけに絞り、以降は増分(REBUILD_INTERVAL)で進める。
    var FIRST_CAP = 12;
    if (lastBuild < 0 && (curTurn + 1) > FIRST_CAP) startIdx = curTurn - FIRST_CAP + 1;
    var newTurns = st.turns.slice(startIdx, curTurn + 1);
    var prompt = buildPrompt(prevSum, prevWI, prevEv, newTurns, startIdx);
    call(prompt, function(result){
      BUSY = false;
      if (!result){ try { console.log(TAG, 'rebuild returned null (timeout/parse-fail)'); } catch(_){} return; }
      // ★fix299b: 要約中(最大90s)にスロット切替/物語差替が起きていたら、このスロットには保存しない。
      var s2 = getState();
      if (!s2 || !s2.scene || (s2.scene.loc || null) !== startLoc){ try { console.log(TAG, 'story changed during summarize — discarded (no cross-slot write)'); } catch(_){} return; }
      if (slotSfx() !== startSfx){ try { console.log(TAG, 'active slot changed during summarize — discarded'); } catch(_){} return; }
      if (!_lmCanSave()){ try { console.log(TAG, 'rebuild OK but save blocked (stale epoch)'); } catch(_){} }
      if (result.summary) saveSummary(result.summary);
      if (result.worldinfo && result.worldinfo.length) saveWorldInfo(result.worldinfo);
      if (result.events && result.events.length) saveEvents(result.events);
      saveLastBuild(curTurn);
      try { console.log(TAG, 'rebuilt at turn', curTurn, '— summary:', (result.summary||'').length, 'chars, worldinfo:', result.worldinfo.length, ', events:', result.events.length); } catch(_){}
    });
  }

  // ---------- reset (called on story reset) ----------
  function reset(){
    try { localStorage.removeItem(LSP_SUMMARY); } catch(e){}
    try { localStorage.removeItem(LSP_WORLDINFO); } catch(e){}
    try { localStorage.removeItem(LSP_EVENTS); } catch(e){}
    try { localStorage.removeItem(LSP_LASTBUILD); } catch(e){}
  }

  // v292Dfix143: stronger scene-relevance scoring for B. Uses last 3 turns' narrative
  // + playerText to extract referenced names, then scores worldinfo by:
  //   +5 if name appears in recent text  +3 if active hero  +2 if active NPC  +1 type=place
  // Returns top N by score (filter score>0 unless caller wants baseline).
  function recentTextForRelevance(){
    try {
      var st = (typeof S !== 'undefined' && S) ? S : window.S;
      if (!st || !st.turns) return '';
      var n = Math.min(3, st.turns.length);
      var slice = st.turns.slice(-n);
      return slice.map(function(t){ return (t.playerText || '') + ' ' + (t.narrative || ''); }).join(' ');
    } catch(e){ return ''; }
  }
  function activeCastNames(){
    var heroName = '', npcNames = [];
    try {
      var st = (typeof S !== 'undefined' && S) ? S : window.S;
      if (st && st.cast){
        if (st.cast.hero && st.cast.hero.name) heroName = st.cast.hero.name;
        if (Array.isArray(st.cast.npcs)) npcNames = st.cast.npcs.map(function(n){ return n && n.name; }).filter(Boolean);
      }
    } catch(e){}
    return { hero: heroName, npcs: npcNames };
  }

  // ---------- public API ----------
  window.__longmem = {
    getSummary: function(){ return loadSummary(); },
    // v292Dfix143: limit defaults to 8; pass smaller for compression mode (A)
    getWorldInfoFor: function(text, limit){
      var wi = loadWorldInfo();
      if (!wi.length) return [];
      limit = (typeof limit === 'number' && limit > 0) ? limit : 8;
      // Build relevance text = explicit `text` + recent 3-turn context
      var relText = (text || '') + ' ' + recentTextForRelevance();
      var cast = activeCastNames();
      var scored = wi.map(function(w){
        var score = 0;
        if (w.name){
          if (relText.indexOf(w.name) >= 0) score += 5;
          if (cast.hero && cast.hero === w.name) score += 3;
          if (cast.npcs.indexOf(w.name) >= 0) score += 2;
        }
        if (w.type === 'character' && score === 0) score += 0.5;  // baseline floor for any char
        return { w: w, score: score };
      });
      scored.sort(function(a, b){ return b.score - a.score; });
      return scored.filter(function(s){ return s.score > 0; }).map(function(s){ return s.w; }).slice(0, limit);
    },
    // v292Dfix143: limit defaults to 6; pass smaller for compression mode (A).
    // Scoring: importance×2 + recency_bonus(closer turn=+) + mention_in_recent_text(+3).
    getKeyEvents: function(limit){
      limit = (typeof limit === 'number' && limit > 0) ? limit : 6;
      var ev = loadEvents().filter(function(e){ return e.importance >= 2; });
      if (!ev.length) return [];
      var relText = recentTextForRelevance();
      // v292Dfix153a(2026-05-30): 圧縮guard。fix150 緊急圧縮は getKeyEvents(1) を呼ぶため、
      //   直前ターンで起きた重要事象（キャラ死亡/負傷/拘束など）が limit に押し出されて
      //   sys から消え、次ターンで連続性が壊れる（おしん指摘「ミホ死亡→生存扱い」型）。
      //   そこで「直近 PROTECT_RECENT(=3) ターンの重要事象は limit に関わらず必ず含める」guard
      //   を追加する。保護分を先頭に置き、残り枠を従来のスコア順で埋める。
      var PROTECT_RECENT = 3;
      // curTurn 基準（イベントの最大 turnIdx ではなく現在のターン番号）で「直近」を判定する。
      var curTurn = 0;
      try {
        var st = (typeof S !== 'undefined' && S) ? S : window.S;
        if (st && st.turns && st.turns.length) curTurn = st.turns.length - 1;
      } catch(_e){}
      var maxTurn = ev.reduce(function(m, e){ return Math.max(m, e.turnIdx || 0); }, 0);
      var recentRef = Math.max(curTurn, maxTurn);
      var scored = ev.map(function(e){
        var score = (e.importance || 0) * 2;
        // v292Dfix152-C: stronger recency weight so "what just happened" is prioritized.
        // 直近2ターン=+5 / 5ターン=+3 / 10ターン=+1 (previously max +3 across 5 turns).
        // これでミホ死亡みたいな最新事象が確実に sys に入る。
        if (typeof e.turnIdx === 'number' && maxTurn > 0){
          var dist = maxTurn - e.turnIdx;
          if (dist <= 2) score += 5;
          else if (dist <= 5) score += 3;
          else if (dist <= 10) score += 1;
        }
        // mention in recent narrative: +3
        if (e.event && relText.indexOf(String(e.event).substring(0, 10)) >= 0) score += 3;
        return { e: e, score: score };
      });
      scored.sort(function(a, b){ return b.score - a.score; });
      // 圧縮guard: 直近 PROTECT_RECENT ターン内の事象を必ず確保（時系列順で先頭に固定）。
      var protectedEv = scored
        .filter(function(s){ return typeof s.e.turnIdx === 'number' && (recentRef - s.e.turnIdx) <= (PROTECT_RECENT - 1); })
        .map(function(s){ return s.e; })
        .sort(function(a, b){ return (a.turnIdx || 0) - (b.turnIdx || 0); });
      var protectedSet = protectedEv.slice();   // copy for membership test
      var rest = scored
        .map(function(s){ return s.e; })
        .filter(function(e){ return protectedSet.indexOf(e) < 0; });
      // 保護分が limit を超える場合でも、保護分は全て残す（直近3ターンは絶対削らない）。
      var out = protectedEv.concat(rest);
      var keep = (protectedEv.length >= limit) ? protectedEv : out.slice(0, limit);
      return keep;
    },
    rebuild: maybeRebuild,
    reset: reset,
    raw: { loadSummary: loadSummary, loadWorldInfo: loadWorldInfo, loadEvents: loadEvents, loadLastBuild: loadLastBuild }
  };

  // ---------- periodic check: poll every 5s for new turn ----------
  var lastTurnCount = -1;
  setInterval(function(){
    var st = getState();
    if (!st || !st.turns) return;
    var tc = st.turns.length;
    if (tc !== lastTurnCount){
      lastTurnCount = tc;
      maybeRebuild();
    }
  }, 5000);

  // Initial check after 3s (handles page reload with existing state)
  setTimeout(function(){
    var st = getState();
    if (st && st.turns) lastTurnCount = st.turns.length;
    maybeRebuild();
  }, 3000);

  // fix299: タブが前面化したら即チェック(背景中に溜まった分を catch-up)。
  try {
    window.addEventListener('focus', function(){ try { maybeRebuild(); } catch(e){} });
    document.addEventListener('visibilitychange', function(){ if (!document.hidden){ try { maybeRebuild(); } catch(e){} } });
  } catch(e){}

  // Reset hook: 物語のターンが無い(turns=0)のに長期記憶ストアが残っていたら消す。
  // v292Dfix180: 旧フックは「prevTC>0→0 の遷移を同一セッションで観測した時だけ」発火した
  //   ため、別タブ(特に旧ビルドの resetStory が長期記憶を消さない)でリセット→このビルドが
  //   turns=0 の状態でロードされるケースを取りこぼし、worldinfo/summary/events が残って
  //   キャラ一覧に前ゲームのゴースト(例: ミリア「眼球を失った」/自動抽出の妖怪)が出ていた。
  //   遷移観測に依らず「turns=0 かつ 長期記憶にデータ有り」を毎チェックで掃除する(=ロード時も
  //   最初のtickで自己修復)。turns>0 の進行中ゲームや、turns=0かつ長期記憶も空の新規には無干渉。
  function _hasStaleLongMem(){
    try {
      return (loadWorldInfo().length > 0) || !!loadSummary() ||
             (loadEvents().length > 0) || (loadLastBuild() >= 0);
    } catch(e){ return false; }
  }
  setInterval(function(){
    var st = getState();
    if (!st || !st.turns) return;
    if (st.turns.length === 0 && _hasStaleLongMem()){
      reset();
      try { localStorage.removeItem('v292Dfix77States'); } catch(_){}
      try { if (window.__v292Dfix77Store){ Object.keys(window.__v292Dfix77Store).forEach(function(k){ delete window.__v292Dfix77Store[k]; }); } } catch(_){}
      try { console.log(TAG, 'no turns but stale long-mem — cleared'); } catch(_){}
    }
  }, 4000);

  try { console.log(TAG, 'long-term memory active (fix135+136+137)'); } catch(_){}
})();
