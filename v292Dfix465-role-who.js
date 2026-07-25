// =====================================================================
// Chronicle TRPG - v292Dfix465: 役割名で指定された話者(who)の扱いを厳格化
// ---------------------------------------------------------------------
// 背景(GPT-5.6監査): モデルが登録NPCを <say who="看護師"> のように**役割名**で書くことがある。
//   ・そのまま通すと「看護師」という**幽霊キャラのカード/アイコン**が生まれる（実測あり）
//   ・かといって「説明文に一意に出てくる語」で機械的に配役すると**誤配役**が起きやすい（GPT指摘）
//
// 方針(GPT指摘どおり):
//   ①**役割語の完全一致だけ**を対象にする（部分一致・説明文の曖昧マッチはしない）
//   ②その役割語が **cast全体で1人にしか当てはまらない**ときだけ登録名へ振り替える
//   ③当てはまらない未知のwhoは **触らずログに残す**（勝手に配役しない・後で人が確認できる）
//   ※根治(speaker_id)は fix457 で導入済み。本fixは入口の水際対策。
//
// 既定ON。OFF: localStorage v292Dfix465Off='1'
// ログ: localStorage v292Dfix465Log（直近20件・未知whoの記録）
// 検証口: window.__v292Dfix465 = { roleTable, planTurn, repair, log }
// =====================================================================
(function(){
  'use strict';
  if (window.__f465done) return; window.__f465done = 1;
  var TAG = '[v292Dfix465:role-who]';

  var ROLE_WORDS = ['看護師','医師','医者','女将','若女将','店主','主人','店員','老人','湯守','灯台守','漁師','船長',
    '刑事','警官','教師','先生','記者','学者','民俗学者','司書','巫女','神主','僧侶','住職','宮司','運転手','料理人',
    '受付','執事','メイド','村長','町長','駅員','配達員','看板娘','マスター','バーテンダー','管理人','大家','社長',
    '部長','課長','秘書','弁護士','看守','兵士','傭兵','騎士','魔女','占い師'];

  function off(){ try { return localStorage.getItem('v292Dfix465Off') === '1'; } catch(e){ return false; } }
  /* ★fix547(2026-07-25): S の取得は index.html の正式API(fix539)を第一経路にする。
     間接eval 頼みの取得は実機で無言のまま null を返し、判定が丸ごと空振りした前歴がある。
     **第二経路は従来の式をそのまま残す**ので、index.html が古いキャッシュでも挙動は変わらない。
     判定ロジックには一切触れていない(取得経路だけの差し替え)。 */
  function getS(){
    try { var a = window.__chronicleGetState ? window.__chronicleGetState('fix465') : null; if (a) return a; } catch(e){}
    try { return window.S || (0,eval)('typeof S!=="undefined"?S:null') || null; } catch(e){ return null; }
  }
  function nospace(s){ return String(s || '').replace(/[\s　]/g, ''); }

  function cast(S){
    var out = [];
    try {
      if (S && S.cast){
        if (S.cast.hero && S.cast.hero.name) out.push({ n: String(S.cast.hero.name).trim(), d: String(S.cast.hero.desc || '') });
        (S.cast.npcs || []).forEach(function(x){ if (x && x.name) out.push({ n: String(x.name).trim(), d: String(x.desc || '') }); });
      }
    } catch(e){}
    return out;
  }

  // 役割語 → 登録名（1人にしか当てはまらない語だけ）
  function roleTable(list){
    var map = {};
    for (var i = 0; i < ROLE_WORDS.length; i++){
      var w = ROLE_WORDS[i], hit = [];
      for (var j = 0; j < list.length; j++){ if (String(list[j].d || '').indexOf(w) >= 0) hit.push(list[j].n); }
      if (hit.length === 1) map[w] = hit[0];      // 一意のときだけ
    }
    return map;
  }

  function pushLog(who, say){
    try {
      var a = JSON.parse(localStorage.getItem('v292Dfix465Log') || '[]');
      a.push({ t: Date.now(), who: who, say: String(say || '').slice(0, 20) });
      if (a.length > 20) a = a.slice(-20);
      localStorage.setItem('v292Dfix465Log', JSON.stringify(a));
    } catch(e){}
  }

  // 1ターン分。known=登録名の集合(空白無視)。map=役割表。
  function planTurn(t, known, map){
    var cs = t && t._convSays;
    if (!Array.isArray(cs) || !cs.length) return { changed: false, changes: [], unknown: [] };
    var changed = false, changes = [], unknown = [];
    for (var i = 0; i < cs.length; i++){
      var c = cs[i];
      if (!c || !c.who) continue;
      var w = String(c.who).trim();
      if (known[nospace(w)]) continue;                       // 登録キャラ = 正常
      if (map[w]){                                           // 役割語の**完全一致**かつ一意
        changes.push({ from: w, to: map[w], say: String(c.say || '').slice(0, 14) });
        c.who = map[w];
        changed = true;
        continue;
      }
      unknown.push({ who: w, say: String(c.say || '').slice(0, 14) });   // 未知 = 触らずログ
    }
    return { changed: changed, changes: changes, unknown: unknown };
  }

  var backedUp = false;
  function repair(){
    if (off()) return { changed: false };
    var S = getS();
    if (!S || !Array.isArray(S.turns) || !S.turns.length) return { changed: false };
    var list = cast(S);
    if (list.length < 2) return { changed: false };
    var known = {};
    list.forEach(function(m){ known[nospace(m.n)] = 1; });
    var map = roleTable(list);
    var any = false, log = [], unk = [];
    for (var ti = 0; ti < S.turns.length; ti++){
      var p = planTurn(S.turns[ti], known, map);
      if (p.changed){
        if (!backedUp){ try { localStorage.setItem('chr6_bk_fix465', localStorage.getItem('chr6') || ''); } catch(e){} backedUp = true; }
        any = true;
        log.push({ turn: ti + 1, changes: p.changes });
      }
      if (p.unknown.length) unk = unk.concat(p.unknown);
    }
    if (any){
      try { if (S.save && !document.hidden) S.save(); } catch(e){}
      try {
        var cards = document.querySelectorAll('.v292-dlg-card');
        for (var i = 0; i < cards.length; i++){ if (cards[i].parentNode) cards[i].parentNode.removeChild(cards[i]); }
        if (window.__v292Dfix66 && window.__v292Dfix66.repair) window.__v292Dfix66.repair();
      } catch(e){}
      try { console.log(TAG, '役割名→登録名:', JSON.stringify(log)); } catch(e){}
    }
    if (unk.length){
      unk.slice(0, 3).forEach(function(u){ pushLog(u.who, u.say); });
      try { console.log(TAG, '未知のwho(触らずログのみ):', JSON.stringify(unk.slice(0, 3))); } catch(e){}
    }
    return { changed: any, log: log, unknown: unk };
  }

  var lastSig = '';
  function tick(){
    try {
      if (off()) return;
      var S = getS();
      if (!S || !Array.isArray(S.turns)) return;
      var last = S.turns[S.turns.length - 1];
      var sig = S.turns.length + ':' + ((last && Array.isArray(last._convSays)) ? last._convSays.length : 0);
      if (sig === lastSig) return;
      lastSig = sig;
      repair();
    } catch(e){}
  }
  try { setTimeout(tick, 3500); setInterval(tick, 2500); } catch(e){}

  window.__v292Dfix465 = {
    __armed: true, ROLE_WORDS: ROLE_WORDS, roleTable: roleTable, planTurn: planTurn, repair: repair,
    log: function(){ try { return JSON.parse(localStorage.getItem('v292Dfix465Log') || '[]'); } catch(e){ return []; } },
    isOff: off
  };
  try { console.log(TAG, 'loaded'); } catch(e){}
})();
