// =====================================================================
// Chronicle TRPG - v292Dfix390: 会話ログの話者名を正名（フルネーム）へ統一
// ---------------------------------------------------------------------
// 実例(2026-07-06・おしん報告+スクショ): 登録NPC「ユア・ミスト」を、STORYで下の名前
//   「ユア」と言及したら、会話ログに「ユア・ミスト」と「ユア」の2枚のカードが別アイコンで
//   並んだ（同一人物なのに分裂）。
// 真因: モデルが会話では下の名前「ユア」で話者を書く → 会話ログの話者名(_convSays[].who)が
//   「ユア」になる → アイコンのキー(fix197 keyFor)は名前文字列そのままでハッシュするため
//   「ユア」≠「ユア・ミスト」で別アイコンを生成。設定/キャラ一覧は名寄せ(fix377)が効くので無傷。
// おしん確定方針(2026-07-06): 会話ログはフルネームで統一したい（下の名前で言及されても
//   正名でカード化＝ラベルもアイコンも「ユア・ミスト」に寄せる）。
// 方針(fix388と同じデータ層repair流儀):
//   ・話者名 who が「登録キャスト名を中黒『・』で割った姓名パーツ」に完全一致し、かつ
//     そのパーツを持つ登録キャストが【ちょうど1人】なら、who を正名(フルネーム)へ振替。
//   ・fix66.repair で会話ログを再描画 → カードのラベルもアイコン(alt=正名)も自動で統一。
//   ・<say>タグ由来(_rv===1)も対象（「ユア」は誤帰属でなく本人の下の名前なので統一してよい）。
// 誤統合ガード(過剰統合の回避):
//   ・パーツは長さ2以上・中黒完全分割の完全一致のみ（部分文字列/境界推測はしない＝
//     マリア/アリア型の偶然包含を構造的に弾く）。
//   ・who が既に登録キャスト名そのものなら正名＝不触。
//   ・同じパーツを持つ登録キャストが2人以上なら曖昧＝振替しない。
// 既定ON（明確なバグ修正）。OFF: localStorage v292Dfix390Off='1'。
// バックアップ: 補正直前のchr6を chr6_bk_fix390 に保存（セッション毎上書き）。
// 検証: window.__v292Dfix390x = { dryRun, status, repair, resolve }。
// =====================================================================
(function(){
  'use strict';
  if (window.__f390done) return; window.__f390done = 1;
  var TAG = '[v292Dfix390:speaker-fullname]';
  var MIDDOT = /[・･·]/;   // 中黒（全角・半角・中点）

  function off(){ try { return localStorage.getItem('v292Dfix390Off') === '1'; } catch(e){ return false; } }
  function getS(){ try { return window.S || (0,eval)('typeof S!=="undefined" ? S : null'); } catch(e){ return null; } }

  // 登録キャスト名（hero + npcs）。
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

  // 中黒で割った姓名パーツ（長さ2以上のみ）。
  function partsOf(name){
    if (!MIDDOT.test(name)) return [];
    return String(name).split(MIDDOT).map(function(p){ return p.trim(); }).filter(function(p){ return p.length >= 2; });
  }

  // who を正名へ解決。振替不要/曖昧なら '' を返す（純関数）。
  function resolveFull(who, cast){
    who = String(who || '').trim();
    if (who.length < 2) return '';
    cast = cast || castNames();
    // 既に登録キャスト名そのもの＝正名＝不触
    for (var i = 0; i < cast.length; i++){ if (cast[i] === who) return ''; }
    // who を姓名パーツに持つ登録キャストを収集
    var matches = [];
    for (var j = 0; j < cast.length; j++){
      var c = cast[j];
      if (c === who) continue;
      var parts = partsOf(c);
      if (parts.indexOf(who) >= 0) matches.push(c);
    }
    if (matches.length === 1) return matches[0];   // 一意な時だけ振替（曖昧は見送り）
    return '';
  }

  // 1ターン分の _convSays を検査（副作用なし）。
  function planTurn(t, cast){
    var cs = t && t._convSays;
    if (!Array.isArray(cs)) return { changed: false };
    var changes = [], changed = false;
    for (var i = 0; i < cs.length; i++){
      var s = cs[i]; if (!s) continue;
      var who = String(s.who || '').trim();
      var full = resolveFull(who, cast);
      if (full && full !== who){
        s.who = full; changed = true;
        changes.push({ from: who, to: full, say: String(s.say || '').slice(0, 16) });
      }
    }
    return { changed: changed, changes: changes };
  }

  // 全ターン検査＆適用（変更時のみ save + 再描画）。
  function repair(){
    if (off()) return { changed: false };
    var S = getS();
    if (!S || !Array.isArray(S.turns) || !S.turns.length) return { changed: false };
    var cast = castNames();
    if (!cast.length) return { changed: false };
    var anyChange = false, log = [], backedUp = false;
    for (var ti = 0; ti < S.turns.length; ti++){
      var plan = planTurn(S.turns[ti], cast);
      if (plan.changed){
        if (!backedUp){ try { localStorage.setItem('chr6_bk_fix390', localStorage.getItem('chr6') || ''); } catch(e){} backedUp = true; }
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

  // 起動6秒後に全ターン走査 → 以後2秒ポーリング（新ターン追従）。
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
  setTimeout(function(){ tick(); setInterval(tick, 2000); }, 6000);

  // 検証用（純粋・副作用なし）。
  window.__v292Dfix390x = {
    dryRun: function(){
      var S = getS(); if (!S || !S.turns) return null;
      var cast = castNames(); var res = [];
      for (var i = 0; i < S.turns.length; i++){
        var copy = { _convSays: (S.turns[i]._convSays || []).map(function(x){ return x ? { who: x.who, say: x.say, _rv: x._rv } : x; }) };
        var p = planTurn(copy, cast);
        if (p.changed) res.push({ turn: i + 1, changes: p.changes });
      }
      return res;
    },
    status: function(){ return { off: off(), cast: castNames() }; },
    resolve: function(who){ return resolveFull(who, castNames()); },
    repair: repair
  };
  try { console.log(TAG, 'loaded (off=' + (off() ? '1' : '0') + ')'); } catch(e){}
})();
