// =====================================================================
// Chronicle TRPG - v292Dfix409: 会話ログの呼称を台帳の正名へ統一(正名統一)
// ---------------------------------------------------------------------
// 実例(2026-07-10・おしん報告): キャラ台帳(fix307ロスター)に「観覧車の少女」が居るのに、
//   会話ログでは同一人物が「少女」という省略呼称で話者化していた。会話ログの話者名
//   (_convSays[].who)とアイコンキー(fix197 keyFor)は名前文字列そのままでハッシュするため、
//   「少女」≠「観覧車の少女」で別キャラ扱い=別アイコン・別状態カードに分裂した。
// 真因: モデルは会話では正名の一部(「少女」)だけで話者を書くことがある → whoが省略呼称に
//   なる → 名寄せ(fix377/390)は中黒姓名パーツ完全一致しか救えず、「観覧車の少女」型の
//   末尾一致(修飾つき呼称)は素通りしていた。
// 方針(fix390と同じデータ層repair流儀 + keeper注入の2層):
//   (a) データ層: who が「正名(登録cast + fix307ロスターhandle)のどれか1つの末尾完全一致」
//       ならその正名へ振替。「少女」⊂「観覧車の少女」は可。1字(「男」)は不可。
//       ・過剰統合ガード: who.length>=2・末尾完全一致・複数候補は不触・whoが正名そのものは不触。
//       ・fix66.repair で会話ログを再描画 → ラベルもアイコン(alt=正名)も自動で統一。
//       ・fix390と二重に走っても安全(冪等: 正名になったwhoは末尾一致で自分自身にしか当たらず不触)。
//   (b) keeper注入(fix379c __f379reg・prio3): 台帳呼称(ロスターhandle上位5件+登録NPC名)を
//       「この正式呼称で書き省略形を作るな」とsys末尾に毎ターン注入(発生自体を抑止)。
// 既定ON(明確なバグ修正)。OFF: localStorage v292Dfix409Off='1'。
// バックアップ: 補正直前のchr6を chr6_bk_fix409 に保存(セッション毎上書き)。
// 検証: window.__v292Dfix409x = { dryRun, repair, resolve }。
// ---------------------------------------------------------------------
// ★fix409b(2026-07-11・GPT-5.6レビュー統合/おしん決定=fix409はON維持で安全ゲート追加):
//   実績事故: ロスターに重複エントリ(「怪異」→重複「孤児院の怪異」)があると誤統合した。
//   GPTは一時OFF推奨だったが、ブランケット除外は本来目的(省略呼称の統一)を壊す=不採用。
//   代わりに実適用の直前に安全ゲートを課す。OFF: localStorage v292Dfix409bOff='1'(=従来fix409挙動)。
//   (a) 統合ゲート canApply(from,to,ti): 次の両方を満たす時だけ振替を実適用する。
//       条件1: 統合先to が「fix307ロスターに handle===to でappr(外見)が非空のエントリがある」
//              または「登録cast名(castNames)に含まれる」こと(存在しない/情報の薄い呼称への
//              吸い込みを防ぐ)。
//       条件2(同場面共起): 変更対象ターンtiの前後1ターン(ti-1..ti+1)いずれかのテキスト
//              (narrative/playerText/text/body と _convSays[].say の連結)に to が出現すること
//              (別場面の台帳エントリへの誤統合を防ぐ)。
//       どちらか欠けたらそのchangeはスキップ(dryRun/logには reason 付きで残す)。
//       dryRun経路(planTurnをコピーに対して呼ぶ)でも同じゲートが効くよう、planTurnに
//       ti(ターンindex)と ctx(apprSet/castSet/turns=実S.turns参照) を渡す。
//   (b) バックアップ強化: 適用前blobを chr6_bk_fix409_<Date.now()> にJSON{key,blob,ts}で退避し、
//       chr6_bk_fix409_<digits> を新しい順3件だけ残して古いものを削除(既存の無印
//       chr6_bk_fix409 キーは触らず残置)。統合ログ v292Dfix409_log にJSON配列で
//       {ts,turn,from,to} をappend(上限50件・古い順evict)。
//   (c) inFlight延期: repair()冒頭で S.inFlight(生成飛行中)なら実行を延期し、lastSigをnullへ
//       戻して次tickで再評価させる(生成完了直後の暫定状態への適用を避ける)。
//       ※採用フラグ根拠: index.html本体エンジンが Api.call の前に S.inFlight=true、finally で
//         false に戻す唯一の飛行中フラグ。S.submit/cont/retry も if(S.inFlight)return で
//         これを見張っている。fix409の getS() が返す同一 S 上のプロパティ。
// =====================================================================
(function(){
  'use strict';
  if (window.__f409done) return; window.__f409done = 1;
  var TAG = '[v292Dfix409:handle-merge]';

  function off(){ try { return localStorage.getItem('v292Dfix409Off') === '1'; } catch(e){ return false; } }
  function off409b(){ try { return localStorage.getItem('v292Dfix409bOff') === '1'; } catch(e){ return false; } }  // fix409b: 新ゲートのみ無効化(=従来fix409挙動)
  function getS(){ try { return window.S || (0,eval)('typeof S!=="undefined" ? S : null'); } catch(e){ return null; } }

  // fix307ロスターの取得(未ロード時は空配列)。
  function loadRoster(){
    try {
      var api = window.__v292Dfix307api;
      if (api && typeof api.loadRoster === 'function') return api.loadRoster() || [];
    } catch(e){}
    return [];
  }

  // 登録キャスト名(hero + npcs)。
  function castNames(){
    var names = [], seen = {};
    function add(n){ n = String(n || '').trim(); if (n && !seen[n]){ seen[n] = true; names.push(n); } }
    try {
      var S = getS();
      if (S && S.cast){
        if (S.cast.hero && S.cast.hero.name) add(S.cast.hero.name);
        var ns = S.cast.npcs || [];
        for (var i = 0; i < ns.length; i++){ if (ns[i] && ns[i].name) add(ns[i].name); }
      }
    } catch(e){}
    return names;
  }

  // 正名リスト = 登録cast + fix307ロスターhandle。
  function canonNames(){
    var names = castNames(), seen = {};
    for (var i = 0; i < names.length; i++){ seen[names[i]] = true; }
    var roster = loadRoster();
    for (var j = 0; j < roster.length; j++){
      var h = roster[j] && roster[j].handle ? String(roster[j].handle).trim() : '';
      if (h && !seen[h]){ seen[h] = true; names.push(h); }
    }
    return names;
  }

  // who を正名へ解決。振替不要/曖昧なら '' を返す(純関数)。
  //   条件: who.length>=2 かつ 正名N!==who かつ N が who で末尾完全一致 かつ 一意。
  function resolveCanon(who, names){
    who = String(who || '').trim();
    if (who.length < 2) return '';
    names = names || canonNames();
    // 既に正名そのもの＝不触
    for (var i = 0; i < names.length; i++){ if (names[i] === who) return ''; }
    var matches = [];
    for (var j = 0; j < names.length; j++){
      var n = String(names[j] || '');
      if (n === who || n.length <= who.length) continue;
      if (n.slice(n.length - who.length) === who) matches.push(n);   // 末尾完全一致
    }
    if (matches.length === 1) return matches[0];   // 一意な時だけ振替(曖昧は見送り)
    return '';
  }

  // ---- fix409b(a): 統合ゲート ----
  // ロスターで appr(外見) が非空の handle 集合。
  function rosterApprSet(){
    var set = {}, roster = loadRoster();
    for (var i = 0; i < roster.length; i++){
      var r = roster[i]; if (!r || !r.handle) continue;
      var h = String(r.handle).trim();
      var a = String(r.appr != null ? r.appr : '').trim();
      if (h && a) set[h] = true;
    }
    return set;
  }
  // 登録cast名の集合。
  function castNameSet(){
    var set = {}, ns = castNames();
    for (var i = 0; i < ns.length; i++){ set[ns[i]] = true; }
    return set;
  }
  // 1ターン分の全テキスト(narrative/playerText/text/body + _convSays[].say)を連結。
  function turnText(t){
    if (!t) return '';
    var parts = [];
    if (t.narrative)  parts.push(String(t.narrative));
    if (t.playerText) parts.push(String(t.playerText));
    if (t.text)       parts.push(String(t.text));
    if (t.body)       parts.push(String(t.body));
    var cs = t._convSays;
    if (Array.isArray(cs)){
      for (var i = 0; i < cs.length; i++){ if (cs[i] && cs[i].say) parts.push(String(cs[i].say)); }
    }
    return parts.join('\n');
  }
  // 条件2: ti-1..ti+1 のいずれかのテキストに to が出現するか。
  function coOccurs(to, ti, turns){
    if (!Array.isArray(turns)) return true;   // 実行時にturns参照が無い異常系はcond1のみで防御(fail-open)
    for (var d = -1; d <= 1; d++){
      var tj = ti + d;
      if (tj < 0 || tj >= turns.length) continue;
      if (turnText(turns[tj]).indexOf(to) >= 0) return true;
    }
    return false;
  }
  // 統合可否。off409b時は常に許可(=従来fix409挙動)。
  //   ctx = { apprSet, castSet, turns }。返り値 { ok:bool, reason? }。
  function canApply(from, to, ti, ctx){
    if (off409b()) return { ok: true };
    if (!ctx) return { ok: true };            // 現行の呼び出し元は必ずctxを渡す(保険でfail-open)
    var cond1 = !!(ctx.apprSet[to] || ctx.castSet[to]);
    if (!cond1) return { ok: false, reason: 'no-appr-no-cast' };
    var cond2 = coOccurs(to, ti, ctx.turns);
    if (!cond2) return { ok: false, reason: 'no-cooccurrence' };
    return { ok: true };
  }

  // 1ターン分の _convSays を検査。ctx(fix409b)があれば canApply ゲートを課す。
  //   changes: 適用は {from,to,say}、スキップは {from,to,say,skipped:true,reason}。
  function planTurn(t, names, ti, ctx){
    var cs = t && t._convSays;
    if (!Array.isArray(cs)) return { changed: false };
    var changes = [], changed = false;
    for (var i = 0; i < cs.length; i++){
      var s = cs[i]; if (!s) continue;
      var who = String(s.who || '').trim();
      var full = resolveCanon(who, names);
      if (full && full !== who){
        var gate = canApply(who, full, ti, ctx);
        if (gate.ok){
          s.who = full; changed = true;
          changes.push({ from: who, to: full, say: String(s.say || '').slice(0, 16) });
        } else {
          changes.push({ from: who, to: full, say: String(s.say || '').slice(0, 16), skipped: true, reason: gate.reason });
        }
      }
    }
    return { changed: changed, changes: changes };
  }

  // ---- fix409b(b): バックアップ強化 + 統合ログ ----
  var lastBkTs = 0;   // 同一ms内の連続退避でもキー衝突しないよう単調増加を保証。
  function activeSlotKey(){
    var ak = 'chr6';
    try { if (typeof window.__chr6Key === 'function') ak = window.__chr6Key() || 'chr6'; } catch(e){}
    return ak;
  }
  // ★fix409b D-4(2026-07-11): 書込後read-backで検証しboolean返却。失敗ならfalse(呼び出し側は適用を中止)。
  function backupBefore(){
    try {
      var ak = activeSlotKey();
      var blob = '';
      try { blob = localStorage.getItem(ak) || ''; } catch(e){}
      if (off409b()){
        // 従来fix409: 無印キーへ退避(セッション毎上書き)。read-back検証つき。
        try { localStorage.setItem('chr6_bk_fix409', blob); } catch(e){ return false; }
        try { return localStorage.getItem('chr6_bk_fix409') === blob; } catch(e){ return false; }
      }
      // fix409b: タイムスタンプ付きバックアップ(無印キーは触らない)。
      var ts = Date.now(); if (ts <= lastBkTs) ts = lastBkTs + 1; lastBkTs = ts;
      var key = 'chr6_bk_fix409_' + ts;
      var payload = JSON.stringify({ key: ak, blob: blob, ts: ts });
      try { localStorage.setItem(key, payload); } catch(e){ return false; }
      // read-back検証: JSON.parseして key/blob 一致を確認。
      var ok = false;
      try { var rb = localStorage.getItem(key); if (rb){ var o = JSON.parse(rb); ok = !!(o && o.key === ak && o.blob === blob); } } catch(e){ ok = false; }
      if (!ok){ try { localStorage.removeItem(key); } catch(e){} return false; }
      pruneBackups(3);
      return true;
    } catch(e){ return false; }
  }
  // chr6_bk_fix409_<digits> を新しい順 keep 件だけ残す(無印/…_wi 等は正規表現で除外)。
  function pruneBackups(keep){
    try {
      var keys = [];
      for (var i = 0; i < localStorage.length; i++){
        var k = localStorage.key(i);
        if (k && /^chr6_bk_fix409_\d+$/.test(k)) keys.push(k);
      }
      var PFX = 'chr6_bk_fix409_';
      keys.sort(function(a, b){
        var na = parseInt(a.slice(PFX.length), 10) || 0;
        var nb = parseInt(b.slice(PFX.length), 10) || 0;
        return nb - na;   // 新しい順
      });
      for (var j = keep; j < keys.length; j++){ try { localStorage.removeItem(keys[j]); } catch(e){} }
    } catch(e){}
  }
  // 統合ログ v292Dfix409_log(適用分のみ・上限50件・古い順evict)。
  function appendMergeLog(turnNo, changes){
    try {
      if (off409b()) return;   // 従来fix409はログ無し
      var applied = [];
      for (var i = 0; i < changes.length; i++){ if (changes[i] && !changes[i].skipped) applied.push(changes[i]); }
      if (!applied.length) return;
      var arr = [];
      try { var raw = localStorage.getItem('v292Dfix409_log'); if (raw) arr = JSON.parse(raw) || []; } catch(e){ arr = []; }
      if (!Array.isArray(arr)) arr = [];
      var now = Date.now();
      for (var j = 0; j < applied.length; j++){
        arr.push({ ts: now, turn: turnNo, from: applied[j].from, to: applied[j].to });
      }
      while (arr.length > 50) arr.shift();   // 古い順evict
      try { localStorage.setItem('v292Dfix409_log', JSON.stringify(arr)); } catch(e){}
    } catch(e){}
  }

  // 全ターン検査＆適用(変更時のみ save + 再描画)。
  function repair(){
    if (off()) return { changed: false };
    var S = getS();
    if (!S || !Array.isArray(S.turns) || !S.turns.length) return { changed: false };
    // fix409b(c): 生成飛行中は適用を延期し、次tickで再評価させる(lastSigをnullへ)。
    if (!off409b() && S.inFlight){ lastSig = null; return { changed: false, deferred: true }; }
    var names = canonNames();
    if (!names.length) return { changed: false };
    var ctx = off409b() ? null : { apprSet: rosterApprSet(), castSet: castNameSet(), turns: S.turns };  // fix409b(a): 統合ゲート文脈
    // ★fix409b D-4(2026-07-11): まずdryRun(コピーに対して・副作用なし)で「実適用される変更があるか」確認。
    var willApply = false;
    for (var di = 0; di < S.turns.length; di++){
      var dcopy = { _convSays: ((S.turns[di] && S.turns[di]._convSays) || []).map(function(x){ return x ? { who: x.who, say: x.say, _rv: x._rv } : x; }) };
      var dplan = planTurn(dcopy, names, di, ctx);
      if (dplan.changed){ willApply = true; break; }
    }
    if (!willApply) return { changed: false, log: [] };
    // ★fix409b D-4: 適用前にバックアップ(read-back検証)。失敗なら一切適用しない(planTurn副作用の前に中止)。
    if (!backupBefore()){ try { console.warn(TAG, 'backup verify failed - repair aborted (no changes applied)'); } catch(e){} return { changed: false, backupFailed: true }; }
    // 本適用(バックアップ検証OK後にだけ S.turns を書き換える)。
    var anyChange = false, log = [];
    for (var ti = 0; ti < S.turns.length; ti++){
      var plan = planTurn(S.turns[ti], names, ti, ctx);
      var appliedHere = false;
      if (plan.changes){ for (var ci = 0; ci < plan.changes.length; ci++){ if (!plan.changes[ci].skipped){ appliedHere = true; break; } } }
      if (appliedHere){
        anyChange = true;
        log.push({ turn: ti + 1, changes: plan.changes });
        appendMergeLog(ti + 1, plan.changes);                // fix409b(b): 統合ログ
      } else if (plan.changes && plan.changes.length){
        log.push({ turn: ti + 1, changes: plan.changes });   // スキップのみのターンもlogに残す(reason付き)
      }
    }
    if (anyChange){
      // ★fix409b D-3(2026-07-11): hidden中は保存を延期(pendingSave)し、可視化時にflush。
      try {
        if (S.save){
          if (!document.hidden){ S.save(); }
          else { pendingSave = true; lastSig = null; }
        }
      } catch(e){}
      try {
        var cards = document.querySelectorAll('.v292-dlg-card');
        for (var i = 0; i < cards.length; i++){ if (cards[i].parentNode) cards[i].parentNode.removeChild(cards[i]); }
        if (window.__v292Dfix66 && window.__v292Dfix66.repair) window.__v292Dfix66.repair();
      } catch(e){}
      try { console.log(TAG, 'fixed:', JSON.stringify(log)); } catch(e){}
    }
    return { changed: anyChange, log: log };
  }

  // 起動7秒後に全ターン走査 → 以後2秒ポーリング(新ターン追従)。fix390と同型。
  // ★fix409b D-5(2026-07-11): 軽量署名で変化検知(turns.length単独より鋭敏=編集・_convSays増減・cast/appr変化も拾う)。
  var lastSig = null;
  var pendingSave = false;   // ★fix409b D-3: hidden中に延期した保存(可視化時にflush)
  function hashStr(x){ var h=0; x=String(x); for(var i=0;i<x.length;i++){ h=((h<<5)-h+x.charCodeAt(i))|0; } return h; }
  // ★fix409(2026-07-11 D-3): 直近3ターンの who+say+本文(narrative)のhash。
  //   turns.length不変でも who変更・say編集・本文差替を検知させる(2秒tick再評価のトリガ)。
  function recentTurnsSig(turns){
    try {
      if (!Array.isArray(turns)) return '';
      var len = turns.length, start = (len > 3) ? (len - 3) : 0, parts = [];
      for (var i = start; i < len; i++){
        var t = turns[i] || {};
        var narr = String(t.narrative || t.text || t.body || '');
        var seg = 'N:' + narr;
        var cs = t._convSays;
        if (Array.isArray(cs)){
          for (var j = 0; j < cs.length; j++){
            var c = cs[j] || {};
            seg += '|' + String(c.who || '') + '=' + String(c.say || '');
          }
        }
        parts.push(seg);
      }
      return String(hashStr(parts.join('\u241f')));
    } catch(e){ return ''; }
  }
  function computeSig(){
    try {
      var S = getS();
      if (!S || !Array.isArray(S.turns)) return 'n';
      var turns = S.turns, len = turns.length;
      var last = turns[len - 1] || null;
      var csLen = (last && Array.isArray(last._convSays)) ? last._convSays.length : 0;
      var head = '';
      try { var lt = last ? (last.text || last.narrative || last.body || '') : ''; head = String(lt).slice(0, 64); } catch(e){}
      var castJoin = '';
      try { castJoin = castNames().join(','); } catch(e){}
      var rosterSig = '';
      try {
        var ro = loadRoster(), parts = [];
        for (var i = 0; i < ro.length; i++){ if (ro[i] && ro[i].handle){ parts.push(String(ro[i].handle) + ':' + String(ro[i].appr != null ? ro[i].appr : '')); } }
        rosterSig = String(hashStr(parts.join('|')));
      } catch(e){}
      return len + '|' + csLen + '|' + hashStr(head) + '|' + hashStr(castJoin) + '|' + rosterSig + '|' + recentTurnsSig(turns);   // ★D-3: 直近3ターンwho+say+本文を追加
    } catch(e){ return 'e'; }
  }
  function tick(){
    try {
      if (off()) return;
      var sig = computeSig();
      if (sig === lastSig) return;
      lastSig = sig;
      repair();   // fix409b(c): inFlight中なら repair 内で lastSig=null に戻り次tickで再評価
    } catch(e){}
  }
  setTimeout(function(){ tick(); setInterval(tick, 2000); }, 7000);
  // ★fix409b D-3: hidden中に延期した保存を、可視化時にflush。
  try {
    document.addEventListener('visibilitychange', function(){
      try {
        if (!document.hidden && pendingSave){
          var S = getS();
          if (S && S.save){ S.save(); }
          pendingSave = false;
        }
      } catch(e){}
    });
  } catch(e){}

  // ---- (b) keeper注入(__f379reg・prio3): 台帳呼称を正式呼称として毎ターン明示 ----
  //   台帳呼称(ロスターhandle上位5件+登録NPC名)。空なら空文字を返し注入しない。
  function canonListForSys(){
    var list = [], seen = {};
    function add(n){ n = String(n || '').trim(); if (n && !seen[n]){ seen[n] = true; list.push(n); } }
    var roster = loadRoster();
    for (var i = 0; i < roster.length && i < 5; i++){ if (roster[i] && roster[i].handle) add(roster[i].handle); }
    try {
      var S = getS();
      if (S && S.cast){
        var ns = S.cast.npcs || [];
        for (var j = 0; j < ns.length; j++){ if (ns[j] && ns[j].name) add(ns[j].name); }
      }
    } catch(e){}
    return list;
  }
  (function register(){
    try {
      window.__f379reg = window.__f379reg || [];
      var reg = window.__f379reg;
      var MARKER = '【正式呼称】';
      for (var i = 0; i < reg.length; i++){ if (reg[i] && reg[i].marker === MARKER) return; } // 二重登録回避
      reg.push({ off: 'v292Dfix409Off', marker: MARKER, prio: 3, text: function(){
        try {
          if (off()) return '';
          var list = canonListForSys();
          if (!list.length) return '';
          return MARKER + '登場人物は次の正式呼称で書き、省略形(例:「少女」)や別名を作らない: ' + list.join('、');
        } catch(e){ return ''; }
      } });
      try { console.log(TAG, 'registered to __f379reg (prio3)'); } catch(_){}
    } catch(e){}
  })();

  // 検証用。
  window.__v292Dfix409x = {
    dryRun: function(){
      var S = getS(); if (!S || !S.turns) return null;
      var names = canonNames();
      var ctx = off409b() ? null : { apprSet: rosterApprSet(), castSet: castNameSet(), turns: S.turns };  // fix409b: dryRunでも実turns参照でゲート
      var res = [];
      for (var i = 0; i < S.turns.length; i++){
        var copy = { _convSays: (S.turns[i]._convSays || []).map(function(x){ return x ? { who: x.who, say: x.say, _rv: x._rv } : x; }) };
        var p = planTurn(copy, names, i, ctx);
        if (p.changed || (p.changes && p.changes.length)) res.push({ turn: i + 1, changes: p.changes });
      }
      return res;
    },
    repair: repair,
    computeSig: function(){ return computeSig(); },   // ★fix409b D-5テスト口
    backupBefore: function(){ return backupBefore(); },   // ★fix409b D-4テスト口
    _pendingSave: function(){ return pendingSave; },
    resolve: function(who, names){ return resolveCanon(who, names || canonNames()); },
    // fix409b: 内部関数の検証口。
    canApply: function(from, to, ti){
      var S = getS();
      return canApply(from, to, ti, { apprSet: rosterApprSet(), castSet: castNameSet(), turns: (S && S.turns) || [] });
    }
  };
  try { console.log(TAG, 'loaded (off=' + (off() ? '1' : '0') + ' 409b=' + (off409b() ? 'off' : 'on') + ')'); } catch(e){}
})();
