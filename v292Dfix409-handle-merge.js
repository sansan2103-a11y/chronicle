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
// =====================================================================
(function(){
  'use strict';
  if (window.__f409done) return; window.__f409done = 1;
  var TAG = '[v292Dfix409:handle-merge]';

  function off(){ try { return localStorage.getItem('v292Dfix409Off') === '1'; } catch(e){ return false; } }
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

  // 1ターン分の _convSays を検査(副作用なし)。
  function planTurn(t, names){
    var cs = t && t._convSays;
    if (!Array.isArray(cs)) return { changed: false };
    var changes = [], changed = false;
    for (var i = 0; i < cs.length; i++){
      var s = cs[i]; if (!s) continue;
      var who = String(s.who || '').trim();
      var full = resolveCanon(who, names);
      if (full && full !== who){
        s.who = full; changed = true;
        changes.push({ from: who, to: full, say: String(s.say || '').slice(0, 16) });
      }
    }
    return { changed: changed, changes: changes };
  }

  // 全ターン検査＆適用(変更時のみ save + 再描画)。
  function repair(){
    if (off()) return { changed: false };
    var S = getS();
    if (!S || !Array.isArray(S.turns) || !S.turns.length) return { changed: false };
    var names = canonNames();
    if (!names.length) return { changed: false };
    var anyChange = false, log = [], backedUp = false;
    for (var ti = 0; ti < S.turns.length; ti++){
      var plan = planTurn(S.turns[ti], names);
      if (plan.changed){
        if (!backedUp){ try { var ak='chr6'; try{ if(typeof window.__chr6Key==='function') ak=window.__chr6Key()||'chr6'; }catch(e2){} localStorage.setItem('chr6_bk_fix409', localStorage.getItem(ak) || ''); } catch(e){} backedUp = true; }  // fix409: 退避はアクティブスロットのblob(chr6固定だと slot使用時に実物語を退避できない)
        anyChange = true;
        log.push({ turn: ti + 1, changes: plan.changes });
      }
    }
    if (anyChange){
      try { if (!document.hidden && S.save) S.save(); } catch(e){}
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
  var lastLen = -1;
  function tick(){
    try {
      if (off()) return;
      var S = getS();
      var len = (S && Array.isArray(S.turns)) ? S.turns.length : -1;
      if (len === lastLen) return;
      lastLen = len;
      repair();
    } catch(e){}
  }
  setTimeout(function(){ tick(); setInterval(tick, 2000); }, 7000);

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
      var names = canonNames(); var res = [];
      for (var i = 0; i < S.turns.length; i++){
        var copy = { _convSays: (S.turns[i]._convSays || []).map(function(x){ return x ? { who: x.who, say: x.say, _rv: x._rv } : x; }) };
        var p = planTurn(copy, names);
        if (p.changed) res.push({ turn: i + 1, changes: p.changes });
      }
      return res;
    },
    repair: repair,
    resolve: function(who, names){ return resolveCanon(who, names || canonNames()); }
  };
  try { console.log(TAG, 'loaded (off=' + (off() ? '1' : '0') + ')'); } catch(e){}
})();
