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
  /* ★v292Dsmrc1: model は集中定義（index.html head の __CHR_MODEL_REGISTRY）から取る。
     この file に model ID の literal を置かない。取れなければ fail-closed（送信しない）。 */
    try { var R = window.__CHR_MODEL_REGISTRY; if (R && R.primary) return R.primary(); } catch(e){}
    return '';
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
  /* ★MEM3（laneMEM3・2026-11-17・Local 試作・既定 OFF: localStorage v292DfixMEM3On='1'・kill v292DfixMEM3Off='1'。毎回評価）
     実測（mem2/AB2_SCORE.md・LONGMEM_GRADE.md）: 作り直しのたびに summary を丸ごと書き直す（300 字・"Replace the previous summary"）ので、
     T3 の名乗りの勤め先・フルネームのような確定事実が落ち、「確認する」が「確認した」に、古い日時が出来事の行に残る。
     ON のときだけ、送る指示の 3 か所（summary の欄の説明・events の欄の説明・Rules の 1 文）を書き換える。書式（「確定：」「未定：」の 2 部）で分け、禁止文は足さない。
     worldinfo の欄の説明・Rules の worldinfo の部分は変えない。送り先・モデル・max_tokens・保存の形（summary は 800 字で切る）も変えない。
     3 か所のどれかが見つからない（ほかの修正で文が変わった）ときは、何も変えずに送る（mismatch を数える）。 */
  var M3_SUM_OLD = '  "summary": "Japanese, 300 chars max. The story so far — plot, current situation, character states. Replace the previous summary.",\n';
  /* ★MEM3 r3（AB3 の A3 4 本: 「確定」に入った「現在…」の瞬間の状態〔時計の針・残り時間・立ち位置・迷い・やりかけ〕が古いまま渡り、巻き戻り・固まり・聞き直しを 5 件起こした）:
     「確定：」は変わりにくい事実だけの欄、筋は「経過：」の欄（済んだ出来事として）、と書式で分ける。瞬間の状態はどの欄の対象でもない形にする（禁止文の行は足さない） */
  /* ★MEM3 r7（r3〜r6 の内容を 1 つの説明に整理して短くした。r6 で足した例外はこれ以上増やさない） */
  var M3_SUM_NEW = '  "summary": "Japanese, 500 chars max, in three labelled parts. 確定：lasting facts — names (full names), affiliations/workplaces, roles, relationships, agreed dates, times and deadlines (e.g. pickup next Friday 18:00, closing at 11), where things are kept and who holds them, settled arrangements; keep each from PREVIOUS SUMMARY until NEW TURNS change it, then write only the new value. 経過：the plot so far as finished happenings. 未定：what is planned, guessed, still to be checked or said with uncertainty (確認する・かもしれない・たしか・〜だったと思う・予定), written as undecided. The current moment (clock time or minutes left, where people stand, hesitation, a half-done task) goes in no part. Each matter goes in one part only; if unsure, 未定. Never 確定: the protagonist\'s feelings the text has not established (a guess goes in 未定); a point where the text conflicts with ESTABLISHED SETTINGS, unless the text formally changes the setting — put in 未定 only what the text says, as unresolved, and never copy setting content into any field; a false or mistaken statement, recorded as 「Aは〜と言った」.",\n';
  var M3_EV_OLD = '"event": "1 line Japanese: a major event (death/escape/encounter/loss/key decision)"';
  var M3_EV_NEW = '"event": "1 line Japanese: a major event (death/escape/encounter/loss/key decision) — only what the text says happened at that turn, with the values as they were at that turn; a plan stays a plan"';   /* ★MEM3 r3: 出来事は起きたターンの値のまま */
  var M3_RULE_OLD = 'Update/replace previous summary entirely.';
  var M3_RULE_NEW = 'Rewrite the summary for the current state, but never drop a 確定 fact unless NEW TURNS change it. Keep each older event exactly as it was at its own turn; when NEW TURNS change a value (e.g. a date), add a new event at the turn of the change, and update only the summary to the new value.';   /* ★MEM3 r3: 変更は新しい行として・更新はあらすじだけ */
  /* ★MEM3 r6/r7 (b): この物語の設定の要点（読むだけ・今の S だけ）。秘密を渡さないための守り（r7）:
       ・Vault で隠した物語・物語 id が分からないとき → 何も渡さない（fail-closed）
       ・lore は改行を潰す前に LORE1 の splitGm で GM の節を外す。LORE1 が無い・失敗 → lore を渡さない
       ・おまかせの「…という隠された理がある」の文は外す
       ・人物の説明も splitGm を通す。GM の印（GM・【GM…】・…専用）が残る／判定できない → その人物の説明を渡さない。「実は…」で始まる文は外す
     上限: lore 200 字・1 人 80 字・人物の合計 300 字（合計 500 字＋見出し）。
     ★MEM3 r9: 人物の説明は渡さない（上の人物の行と M3_SET_PER・M3_SET_CAST は使われない）。渡すのは lore の公開の部分 200 字だけ。 */
  var M3_SET_LORE = 200, M3_SET_PER = 80, M3_SET_CAST = 300, m3SetWhy = null;
  var M3_GMMARK = /(^|[^A-Za-z])(GM|ＧＭ)(?![A-Za-z])|専用】|【\s*(GM|ＧＭ)/;
  var M3_SECRET = /(ただし)?この世界の底には、[^。\n]*という隠された理がある。?/g;
  function m3cut(s, n){ s = String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function m3vaultHidden(){ try { var f = window.__v292Dfix697; var id = f && f.status ? f.status().storyId : null; if (!id) return true; var G = window.__v292DfixVAULTGATE2; if (!G || typeof G.hidden !== 'function') return true; return G.hidden(String(id)) !== false; } catch(e){ return true; } }   /* ★ACCT1 r2（レビュー）: 凍結した fix889（v1）だけでなく VAULTGATE2 の hidden()（v2 と v1 の両方・未取得／不完全／失敗は隠した側）で見る。VAULTGATE2 が無い・kill → 渡さない（ACCT1 と関係なく効く） */
  function m3pub(text){ try { var L = window.__v292DfixLORE1; if (!L || typeof L.splitGm !== 'function') return null; var r = L.splitGm('', String(text == null ? '' : text)); return (r && typeof r.pub === 'string') ? r.pub : null; } catch(e){ return null; } }
  /* ★r8 (0): 秘密の印を含む文は外す（「実は」は文の途中でも）。GM と書かれていない秘密（裏設定・【秘密】・【真相】・本当は・正体は・隠している 等）への安全側の網 */
  var M3_SECRETWORD = /裏設定|秘密|真相|本当は|本当の|正体|隠して|隠し事|実は|ネタバレ/;
  function m3dropSecret(s){ return String(s).split(/(?<=[。！？\n])/).filter(function(x){ return !M3_SECRETWORD.test(x); }).join(''); }
  /* ★MEM3 r10 (2): LORE1 の状態。'ON' のときだけ渡す。影（SHADOW）・kill（KILL）・Vault（VAULT）・LORE1 が無い（ABSENT）・判定できない（UNKNOWN）・
     fix459 が見出しを知らず LORE1 が足さない状態（F459）は渡さない */
  function m3lore1On(){ try { var L = window.__v292DfixLORE1; if (!L || typeof L.mode !== 'function') return 'ABSENT'; var md = L.mode();
      if (md !== 'on') return (md === 'shadow' || md === 'kill' || md === 'vault') ? md.toUpperCase() : 'UNKNOWN';
      if (typeof L.f459State === 'function' && L.f459State() === 'unregistered') return 'F459'; return 'ON'; } catch(e){ return 'UNKNOWN'; } }
  /* ★MEM3 r10 (2): LORE1 が送る範囲（上限 400 字の切り方）に先に合わせてから、こちらの外し方と 200 字の上限を掛ける＝送る文の範囲の内側だけ */
  function m3cap(s){ if (s == null) return null; try { var L = window.__v292DfixLORE1; if (!L || typeof L.capText !== 'function') return null; var c = L.capText(s); return (c && typeof c.text === 'string') ? c.text : null; } catch(e){ return null; } }
  function mem3Settings(){
    m3SetWhy = null;
    try {
      if (m3vaultHidden()){ m3SetWhy = 'VAULT_OR_UNKNOWN'; return ''; }
      var m3L1 = m3lore1On(); if (m3L1 !== 'ON'){ m3SetWhy = 'LORE1_' + m3L1; return ''; }   /* ★MEM3 r10 (2): 本文生成の AI が実際に lore を受け取っているときだけ渡す（fail-closed） */
      if ((m3Fail[slotSfx()] || 0) >= 2){ m3SetWhy = 'FILTER_STOPPED'; return ''; }   /* ★MEM3 r9 (3): 照合の失敗が 2 回続いた物語は、このページの間 渡さない（通常の MEM3 の作り直しで保存する） */
      var st = getState(); if (!st) return '';
      var out = [], lr = st.scene && typeof st.scene.lore === 'string' ? st.scene.lore : '';
      if (lr){ var lp = m3cap(m3pub(lr)); if (lp == null) m3SetWhy = 'NO_LORE1'; else { lp = m3dropSecret(lp.replace(M3_SECRET, '')); if (!M3_GMMARK.test(lp)){ var lore = m3cut(lp, M3_SET_LORE); if (lore) out.push('- 世界: ' + lore); } else m3SetWhy = 'LORE_GM_LEFT'; } }
      /* ★MEM3 r9 (1): 人物の説明（主人公・NPC の desc）は渡さない。正体・関係が普通の文で書かれやすく、抽出 AI へ新しく渡る経路になるため。渡すのは lore の公開の部分（200 字）だけ */
      return out.length ? ('ESTABLISHED SETTINGS (the story setup; reference only, not new events. Copy nothing from this block into any field — summary, worldinfo or events; write only what the story text shows):\n' + out.join('\n') + '\n\n') : '';
    } catch(e){ m3SetWhy = 'THREW'; return ''; }
  }
  /* ★MEM3 r8 (2): 機械的な照合。設定の要点（名前を除いた説明の部分）の 6 字の並びのうち、本文（NEW TURNS と渡した既存の記憶＝送った入力の残り）に無いものを「本文に無い設定の並び」とし、
     作り直しの出力で、その並びを含む summary の文・events の件・worldinfo の説明の文を落とす（worldinfo は項目を消さず、説明が空になったら前の版の説明に戻す。名前は対象外）。
     MEM3On かつ設定の要点を渡した回だけ動く。照合が失敗したら、その回の結果は保存しない（作り直しの失敗と同じ扱い・次の作り直しで取り直す）。 */
  var m3Ctx = null, m3Fail = {};   /* ★r9 (3): 物語（接尾辞）ごとの照合の失敗の連続回数（このページの間だけ） */
  /* ★MEM3 r10 (1): 正規化で空白に加えて句読点・括弧・引用符も除く（設定側・本文側・出力側とも同じ）。「閉まる。」と「閉まる、と」「閉まるよ」の差で公開の事実を落とさない */
  var M3_NORM = /[\s　、。，．,.「」『』（）()［］\[\]【】〔〕〈〉《》“”"'‘’・…‥！？!?：:；;]+/g;
  function m3norm(s){ return String(s == null ? '' : s).replace(M3_NORM, ''); }
  function m3BadGrams(sb, ref){
    var r = m3norm(ref), seen = {}, bad = [];
    String(sb).split('\n').forEach(function(l){ if (!/^- /.test(l)) return; var c = l.indexOf(': '); var t = m3norm(c >= 0 ? l.slice(c + 2) : l.slice(2));
      for (var i = 0; i + 6 <= t.length; i++){ var g = t.slice(i, i + 6); if (seen[g]) continue; seen[g] = 1; if (!/[ぁ-んァ-ヶ一-龠]{3}/.test(g)) continue; if (r.indexOf(g) < 0) bad.push(g); } });
    return bad;
  }
  function m3Units(s){ return String(s == null ? '' : s).split(/(?<=[。！？!?\n])/); }
  function m3Hit(u, bad){ var x = m3norm(u); for (var i = 0; i < bad.length; i++) if (x.indexOf(bad[i]) >= 0) return true; return false; }
  /* ★MEM3 r9 (2): 照合で落とすのは worldinfo の説明の文と summary の「確定」の部の文だけ（r8 は全欄）。events と「経過」「未定」は落とさず、当たった数だけ数える（seenKept）。
     理由: r9 で渡すのは lore の公開の部分だけ（LORE1 が毎ターン物語の AI に送るのと同じ文）で、AI 側の新しい露出は無い。残る害は、設定の言い回しが
     長く残る欄（キャラ一覧に出る worldinfo・毎回渡る「確定」）で固まること（AB4 の 2 件の型）。表記ゆれで公開の事実を落とす害を、出来事と経過・未定から無くす。
     1 回で落とした数（summary＋worldinfo）が 3 以上なら warnMany を数える。 */
  function mem3Filter(r, prevWI, bad){
    if (!r || !bad || !bad.length) return r;
    var n = { summary: 0, worldinfo: 0, events: 0 }, seen = { summary: 0, events: 0 }, sec = '確定';
    var keep = []; m3Units(r.summary).forEach(function(p){ var lab = /^\s*(確定|経過|未定)：/.exec(p); if (lab) sec = lab[1];
      if (m3Hit(p, bad)){ if (sec === '確定'){ n.summary++; if (lab) keep.push(lab[1] + '：'); return; } seen.summary++; } keep.push(p); }); r.summary = keep.join('');
    (r.events || []).forEach(function(e){ if (m3Hit(e && e.event, bad)) seen.events++; });
    r.worldinfo = (r.worldinfo || []).map(function(w){ var us = m3Units(w.desc), k = us.filter(function(u){ return !m3Hit(u, bad); }); if (k.length === us.length) return w; n.worldinfo += us.length - k.length;
      var d = k.join('').trim(); if (!d){ var pv = (prevWI || []).filter(function(x){ return x && x.name === w.name; })[0]; d = (pv && pv.desc && !m3Hit(pv.desc, bad)) ? pv.desc : ''; } return { name: w.name, type: w.type, desc: d }; });
    m3Stat.filtered.summary += n.summary; m3Stat.filtered.worldinfo += n.worldinfo; m3Stat.lastFiltered = n;
    m3Stat.seenKept.summary += seen.summary; m3Stat.seenKept.events += seen.events; if (n.summary + n.worldinfo >= 3) m3Stat.warnMany++;
    return r;
  }
  var m3Stat = { prompts: 0, applied: 0, mismatch: 0, addedChars: 0, settingsChars: 0, lastAdded: 0, lastSettings: 0, lastSettingsWhy: null, filtered: { summary: 0, worldinfo: 0, events: 0 }, lastFiltered: null, filterErr: 0, discarded: 0, seenKept: { summary: 0, events: 0 }, warnMany: 0, filterStopped: 0, skipWhy: {} };
  function mem3On(){ try { return localStorage.getItem('v292DfixMEM3Off') !== '1' && (localStorage.getItem('v292DfixMEM3On') === '1' || m3acct()) && m3trial(); } catch(e){ return false; } }
  function m3acct(){ try { var A = window.__v292DfixACCT1; return !!(A && typeof A.want === 'function' && A.want('mem') === true); } catch(e){ return false; } }   /* ★ACCT1: Owner のアカウントなら端末の鍵が無くても（項目 mem） */
  /* ★MEMTRIAL（GPT #127-WF (3)・試用の間だけの条件）: MEM2 の __v292DfixMEMTrial（Owner の確認・1 か所）を見る。無い・例外 → 働かない（fail-closed） */
  function m3trial(){ try { var G = window.__v292DfixMEMTrial; return !!(G && typeof G.ok === 'function' && G.ok('mem3') === true); } catch(e){ return false; } }
  function mem3Prompt(p){
    m3Ctx = null;   /* ★r8: 照合の材料はこの回の分だけ */
    if (!mem3On()) return p;
    m3Stat.prompts++;
    if (p.split(M3_SUM_OLD).length !== 2 || p.split(M3_EV_OLD).length !== 2 || p.split(M3_RULE_OLD).length !== 2){ m3Stat.mismatch++; return p; }
    var q = p.split(M3_SUM_OLD).join(M3_SUM_NEW).split(M3_EV_OLD).join(M3_EV_NEW).split(M3_RULE_OLD).join(M3_RULE_NEW);
    var sb = mem3Settings(), ni = q.indexOf('\n\nNEW TURNS:\n');   /* ★MEM3 r6/r7 (b): 設定の要点を NEW TURNS の前に（最初の見出しだけ） */
    if (sb && ni >= 0){ q = q.slice(0, ni + 2) + sb + q.slice(ni + 2); try { m3Ctx = { sfx: slotSfx(), bad: m3BadGrams(sb, q.slice(0, ni + 2) + q.slice(ni + 2 + sb.length)) }; } catch(eG){ m3Ctx = { sfx: slotSfx(), bad: null }; } }   /* ★r8 (2): 照合の材料（本文に無い設定の並び） */
    var sl = (sb && ni >= 0) ? sb.length : 0; m3Stat.applied++; m3Stat.addedChars += q.length - p.length; m3Stat.settingsChars += sl; m3Stat.lastAdded = q.length - p.length; m3Stat.lastSettings = sl; m3Stat.lastSettingsWhy = m3SetWhy; if (m3SetWhy === 'FILTER_STOPPED') m3Stat.filterStopped++; if (m3SetWhy) m3Stat.skipWhy[m3SetWhy] = (m3Stat.skipWhy[m3SetWhy] || 0) + 1;
    return q;
  }
  window.__v292DfixMEM3 = { on: mem3On, prompt: mem3Prompt, settings: mem3Settings, filter: function(r, pw, bad){ return mem3Filter(r, pw, bad); }, badGrams: function(sb, ref){ return m3BadGrams(sb, ref); }, stats: function(){ return JSON.parse(JSON.stringify(m3Stat)); } };

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
    return ms1Prompt(mf1Prompt(exp1Prompt(mem3Prompt('You analyze a Japanese ongoing horror TRPG to maintain long-term memory.\n\n' +   /* ★MEM3: OFF は同じ文字列 */
      'PREVIOUS SUMMARY:\n' + (prevSummary || '(none)') + '\n\n' +
      _authBlock245 +
      'KNOWN WORLD INFO:\n' + (prevWorldInfo.length ? prevWorldInfo.map(function(w){var _b = '- ' + w.name + ' (' + w.type + '): ' + w.desc; try { var X = window.__v292DfixEXP1; if (X && typeof X.wiLine === 'function') return X.wiLine(w, _b); } catch(eX){} return _b;}).join('\n') : '(none)') + '\n\n' +
      'KEY EVENTS:\n' + (prevEvents.length ? prevEvents.map(function(e){return '- T' + e.turnIdx + ' (importance ' + e.importance + '): ' + e.event;}).join('\n') : '(none)') + '\n\n' +
      'NEW TURNS:\n' + newText + '\n\n' +
      'Produce a FRESH analysis as JSON with these fields:\n' +
      '{\n' +
      '  "summary": "Japanese, 300 chars max. The story so far — plot, current situation, character states. Replace the previous summary.",\n' +
      '  "worldinfo": [ { "name": "Japanese name", "type": "character|place|object|concept", "desc": "1 sentence Japanese: who/what" } ],\n' +
      '  "events": [ { "turnIdx": number, "event": "1 line Japanese: a major event (death/escape/encounter/loss/key decision)", "importance": 1-3 (3=critical) } ]\n' +
      '}\n' +
      'Rules: Output ONLY the JSON. Update/replace previous summary entirely. Merge new worldinfo entries with old (no duplicates by name; reuse AUTHORITATIVE CHARACTER NAMES verbatim — do not create a second entry under a different label for the same person). Keep worldinfo <= 30 (drop least relevant). Keep events <= 15 (drop low-importance old ones). Use turnIdx values from the [Turn N] markers above.'))));   /* ★MEMFIX1 (c): summary の長さの形（OFF は同じ文字列） */
  }
  /* ★EXP1（既定 OFF・鍵 v292DfixEXP1aOn・kill v292DfixEXP1Off）: 部品 v292DfixEXP1-experience.js が条件を見て、人物の欄に exp の 1 項目を足す。無い・OFF は同じ文字列 */
  function exp1Prompt(p){ try { var X = window.__v292DfixEXP1; return (X && typeof X.prompt === 'function') ? X.prompt(p) : p; } catch(e){ return p; } }

  /* ★MEMFIX1（既定 ON・kill v292DfixMEMFIX1Off）: 長期記憶の作り直しが止まり続ける穴の直し。部品が無い・kill・長期記憶 OFF は土台と同じ */
  function _mf1(){ try { var F = window.__v292DfixMEMFIX1; return (F && typeof F.on === 'function') ? F : null; } catch(e){ return null; } }
  function _mf1Tok(d){ try { var F = _mf1(); return F ? F.tokens(d) : d; } catch(e){ return d; } }
  /* ★MEMSTATE1（既定 ON・kill v292DfixMEMSTATE1Off）: 人物の desc は NEW TURNS の終わりの時点の状態（形式の説明）。部品が無い・kill・長期記憶 OFF は同じ文字列 */
  function _ms1(){ try { var F = window.__v292DfixMEMSTATE1; return (F && typeof F.on === 'function') ? F : null; } catch(e){ return null; } }
  function ms1Prompt(p){ try { var F = _ms1(); return F ? F.prompt(p) : p; } catch(e){ return p; } }
  function mf1Prompt(p){ try { var F = _mf1(); return F ? F.prompt(p) : p; } catch(e){ return p; } }
  function call(prompt, cb){
    var key = getKey();
    if (!key){ cb(null); return; }
    var body;
    var _m = getModel(); if (!_m){ cb(null); return; }   /* v292Dsmrc1: 集中定義が取れないときは送信しない(fail-closed) */
    try {
      var _b = {
        model: _m,
        temperature: 0.3,
        max_tokens: _mf1Tok(2000),   /* ★MEMFIX1: 同じ所で 2 回続けて失敗した後の 1 回だけ 4000（kill・長期記憶 OFF は 2000 のまま） */
        messages: [{ role: 'user', content: prompt }]
      };
      /* ★v292Dsmrc2b: MODEL-SPECIFIC REQUEST POLICY。effective model（_m = registry.primary()）で
         registry の 1 本の関数を呼ぶだけ（merge ロジックをこの file に複製しない）。
         registry が無い環境では従来どおり policy なしの body を送る（fail-open）。
         sampling（temperature）・max_tokens は触らない。 */
      try { var _R = window.__CHR_MODEL_REGISTRY; if (_R && _R.applyRequestPolicy) _R.applyRequestPolicy(_b, _m); } catch(e){}
      body = JSON.stringify(_b);
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
            var _pr = parse(content); if (!_pr){ try { var Fs = _mf1(); if (Fs && Fs.on()) _pr = Fs.salvage(content); } catch(eS){ _pr = null; } }   /* ★MEMFIX1 (a): 途中で切れた JSON から読めた分 */
            cb(_pr);
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
    /* ★MEM4R r2（既定 ON・kill v292DfixMEM4ROff）: 印の無い記憶は材料にせず消し、空の記憶・大きく遅れた記憶は、この物語の本文から 0 ターン目（続き）より分けて作り直す。kill・条件外・1 回で届く時は r4 = null（土台どおり） */
    var r4 = null; if (_lmCanWrite()){ try { var R4 = window.__v292DfixMEM4R; if (R4 && typeof R4.plan === 'function') r4 = R4.plan({ curTurn: curTurn, lastBuild: lastBuild, turns: st.turns, sfx: startSfx }); } catch(eR4){ r4 = null; } }
    var r4Fresh = !!(r4 && r4.reset && !r4.wait); if (r4 && r4.reset) lastBuild = -1;   /* ★MEM4R r3: 先に消さない。前の記憶を材料にせず 0 から作り、保存できたら置き換える（下） */
    if (r4 && r4.wait) return;
    if (curTurn < 2) return;                                  // need at least 3 turns
    if (!(r4 && r4.catchup) && lastBuild >= 0 && curTurn - lastBuild < REBUILD_INTERVAL) return;
    BUSY = true;
    var prevSum = loadSummary();
    var prevWI  = loadWorldInfo();
    var prevEv  = loadEvents();
    if (r4Fresh){ prevSum = ''; prevWI = []; prevEv = []; }   /* ★MEM4R r3: 印の無い古い記憶は材料にしない（今までどおり） */
    var startIdx = lastBuild + 1;
    // fix299: 初回(lastBuild<0)に大量ターンが溜まっていると全要約で巨大プロンプト→タイムアウト永久失敗。
    //   直近FIRST_CAPターンだけに絞り、以降は増分(REBUILD_INTERVAL)で進める。
    var FIRST_CAP = 12;
    if (lastBuild < 0 && (curTurn + 1) > FIRST_CAP) startIdx = curTurn - FIRST_CAP + 1;
    var curAll = curTurn; if (r4 && r4.catchup){ startIdx = r4.from; curTurn = r4.to; }   /* ★MEM4R: 追いつく範囲（1 回 12 ターン・本文 12,000 字まで）。この回の作り直しは curTurn までとして保存・知らせる（OFF は変わらない） */
    var mfP = null; try { var MFx = _mf1(); if (MFx) mfP = MFx.plan({ sfx: startSfx, lb: lastBuild, from: startIdx, to: curTurn, cur: curAll }); } catch(eMF){ mfP = null; }   /* ★MEMFIX1 (b): 続けて失敗した所のやり直しの段取り */
    if (mfP && mfP.wait){ BUSY = false; return; }
    if (mfP && typeof mfP.from === 'number'){ startIdx = mfP.from; curTurn = mfP.to; try { _mf1().setTokens(mfP.tokens); } catch(eMt){} }
    var newTurns = st.turns.slice(startIdx, curTurn + 1);
    var prompt = buildPrompt(prevSum, prevWI, prevEv, newTurns, startIdx);
    call(prompt, function(result){
      BUSY = false;
      if (!result){ try { var MFf = _mf1(); if (MFf) MFf.fail({ sfx: startSfx, lb: lastBuild, to: curTurn, cur: curAll }); } catch(eMf){} try { console.log(TAG, 'rebuild returned null (timeout/parse-fail)'); } catch(_){} return; }
      try { var MFo = _mf1(); if (MFo && MFo.on()){ if (result._cut) result = MFo.fill(result, prevWI, prevEv); result.summary = MFo.cutSummary(result.summary); } } catch(eMo){}   /* ★MEMFIX1 (a)(c): 切れた項目は前の版で補う・summary は文の区切りで切る */
      // ★fix299b: 要約中(最大90s)にスロット切替/物語差替が起きていたら、このスロットには保存しない。
      var s2 = getState();
      if (!s2 || !s2.scene || (s2.scene.loc || null) !== startLoc){ try { console.log(TAG, 'story changed during summarize — discarded (no cross-slot write)'); } catch(_){} return; }
      if (slotSfx() !== startSfx){ try { console.log(TAG, 'active slot changed during summarize — discarded'); } catch(_){} return; }
      if (m3Ctx){ var m3c = m3Ctx; m3Ctx = null; try { if (!m3c.bad) throw new Error('no grams'); result = mem3Filter(result, prevWI, m3c.bad); m3Fail[m3c.sfx] = 0; } catch(eF){ m3Fail[m3c.sfx] = (m3Fail[m3c.sfx] || 0) + 1; m3Stat.filterErr++; m3Stat.discarded++; try { console.log(TAG, 'MEM3 r8: settings check failed — this rebuild is not saved'); } catch(_){} return; } }   /* ★MEM3 r8 (2): MEM3On かつ設定の要点を渡した回だけ */
      try { var X1 = window.__v292DfixEXP1; if (X1 && typeof X1.merge === 'function') result = X1.merge(result, prevWI, { from: startIdx, to: curTurn, text: newTurns.map(function(t){ return String((t && t.playerText) || '') + '\n' + String((t && t.narrative) || ''); }).join('\n'), parts: newTurns.map(function(t, i){ return { i: startIdx + i, pt: String((t && t.playerText) || ''), nr: String((t && t.narrative) || ''), says: ((t && Array.isArray(t._convSays)) ? t._convSays : []).slice(0, 40).map(function(c){ return { who: String((c && c.who) || ''), say: String((c && c.say) || '').slice(0, 80) }; }) }; }), hero: (st && st.cast && st.cast.hero && st.cast.hero.name) ? String(st.cast.hero.name) : '', gender: (function(){ var g = {}; try { if (st && st.cast){ if (st.cast.hero && st.cast.hero.name) g[st.cast.hero.name] = String(st.cast.hero.gender || ''); (st.cast.npcs || []).forEach(function(n){ if (n && n.name) g[n.name] = String(n.gender || ''); }); } } catch(eG){} return g; })(), older: st.turns.slice(Math.max(0, startIdx - 12), startIdx).map(function(t, k){ return { i: Math.max(0, startIdx - 12) + k, pt: String((t && t.playerText) || ''), nr: String((t && t.narrative) || ''), says: ((t && Array.isArray(t._convSays)) ? t._convSays : []).slice(0, 40).map(function(c){ return { who: String((c && c.who) || ''), say: String((c && c.say) || '').slice(0, 80) }; }) }; }) }) || result; } catch(eX1){}
      try { var MSx = _ms1(); if (MSx && MSx.on()) result = MSx.fix(result) || result; } catch(eMS){}   /* ★MEMSTATE1: EXP1 の検査を通った経験の技について、人物の desc と summary の古い「未経験」の節を落とす。★EXP1 r7: older＝この範囲より前の 12 ターン */   /* ★EXP1 r4: ターンごとの本文と会話のタグ（parts）・主人公の名前（hero）・登録の性（gender）も渡す（ターン番号のずれを本文で直す・本人の「できた」・★r5 代名詞と省略の主語・入力の行の taught）。OFF・kill は merge が何もしない */   /* ★EXP1: 型の検査と引き継ぎ（OFF は何もしない） */
      if (!_lmCanSave()){ try { console.log(TAG, 'rebuild OK but save blocked (stale epoch)'); } catch(_){} }
      var r4Old = null; if (r4Fresh){ if (!_lmCanSave()){ try { window.__v292DfixMEM4R.replaced(false); } catch(eRk){} return; } try { r4Old = {}; [LSP_SUMMARY, LSP_WORLDINFO, LSP_EVENTS, LSP_LASTBUILD].forEach(function(k){ r4Old[k] = localStorage.getItem(k); }); reset(); var M2f = window.__v292DfixMEM2; if (M2f && typeof M2f.trust === 'function') M2f.trust(); } catch(eRo){} }   /* ★MEM4R r3: 新しい記憶ができた今、保存の直前に古い記憶を外す（MEM4 が空を見てから見届ける） */
      if (result.summary) saveSummary(result.summary);
      if (result.worldinfo && result.worldinfo.length) saveWorldInfo(result.worldinfo);
      if (result.events && result.events.length) saveEvents(result.events);
      saveLastBuild(curTurn);
      try { var m4h = window.__v292DfixMEM4Done; if (typeof m4h === 'function') m4h({ sfx: startSfx, loc: startLoc, lb: curTurn, ok: _lmCanSave(), r: result }); } catch(_){}   /* ★MEM4 r2/r3: 作り直しの完了を知らせるだけ（保存は上で済んでいる・受け手が無ければ何もしない）。r3: 保存しようとした結果 r を渡す（受け手が保存のとおりかを確かめる） */
      if (r4Fresh && r4Old){ var r4ok = false; try { r4ok = localStorage.getItem(LSP_LASTBUILD) === String(curTurn); } catch(eRv){} if (!r4ok){ try { Object.keys(r4Old).forEach(function(k){ if (r4Old[k] == null) localStorage.removeItem(k); else localStorage.setItem(k, r4Old[k]); }); } catch(eRr){} } try { window.__v292DfixMEM4R.replaced(r4ok); } catch(eRk2){} }   /* ★MEM4R r3: 保存できなければ古い記憶を戻す（両方無い状態を残さない） */
      try { if (r4 && r4.catchup && window.__v292DfixMEM4R) window.__v292DfixMEM4R.finished(startSfx, curTurn, curAll); } catch(eR4f){}   /* ★MEM4R */
      try { var MFk = _mf1(); if (MFk) MFk.ok({ sfx: startSfx }); } catch(eMk){}   /* ★MEMFIX1 */
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
  /* ★★fix894(candidate): engine 起動前（fix889 document 1 等）の S は既定値 turns=[] なので、
     「turns=0 かつ長期記憶あり」を誤検知して longmem / fix77 状態を消してしまう。起動前は何もしない。 */
  function f894Booted(){
    try { if (localStorage.getItem('v292Dfix894Off') === '1') return true; } catch(e){}
    try { var b = window.__chrEngineBoot; if (typeof b === 'function' && b.__ran !== true) return false; } catch(e){}
    return true;
  }
  setInterval(function(){
    if (!f894Booted()) return;                         /* ★fix894 */
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
