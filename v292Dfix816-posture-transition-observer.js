// =====================================================================
// Chronicle TRPG - v292Dfix816: 4D-P POSTURE_TRANSITION_OBSERVER_V1（観測のみ・in-memory・write 0）
// ---------------------------------------------------------------------
// GPT 裁定 2026-09-06（GPT_RULING_4D_L_CLOSED_NO_INTERVENTION_FIX815_DORMANT_P2_GO_20260906.md）:
//   P2 POSTURE_TRANSITION_OBSERVER_V1 = GO / observer only / write0 / sys0 / rewrite0 / state0 /
//   candidate only・**violation 断定禁止**。
//   candidate 条件は狭く「前 turn に明示的な低姿勢・倒位 ＋ 次 turn で強い移動/立位行動 ＋ 途中に起立・姿勢回復表現なし」だけを記録。
//   POSTURE_V1_VOCAB = NARROW / OBSERVED_ONLY（巨大な姿勢辞書は作らない）。
//   「倒れていた次 turn に走った」を全部 candidate にせず、「立ち上がる」が同じ narrative 内にあれば除外する。
//
// 出力名は **POSTURE_TRANSITION_CANDIDATE** のみ（violation / contradiction とは呼ばない）。
// 書くもの: なし。window.__v292Dfix816（in-memory）だけ。localStorage/IDB/server/save payload/sys/生成内容 すべて write 0。
// 既定 OFF（opt-in v292Dfix816On='1'）。kill: v292Dfix816Off='1'。
// 契機: UI.appendTurn の **後**（描画に影響しない・fail-open）。過去 turn は走査しない（履歴 mining は別レーン）。
// 読むもの: turn.narrative / S.cast / window.__v292Dfix77Store（現在 state の karada・READ のみ）/ localStorage（flag READ のみ）。
//
// ★帰属の契約（新しい resolver を作らない）:
//   - karada 由来 = `__v292Dfix77Store[who].karada`。who は state タグの正名なので **帰属済み**。長さ制限なし。
//   - narrative 由来 = 文中に **cast の正名が逐語で出現**する文だけ（harvest254 と同じ規則）。
//     **1 字名は narrative 由来では採用しない**（`朔` の曖昧 match 禁止・skippedShortName に計上するだけ）。
//   - 別名・部分一致・token 救済・推測帰属は **一切しない**。曖昧なら candidate を作らない（沈黙側に倒す）。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix816) return;
  var TAG = '[v292Dfix816:posture-observer]';
  var CAP = 128, SEEN_CAP = 256;

  /* ---- POSTURE_V1_VOCAB = NARROW / OBSERVED_ONLY（GPT 指定 4 語＋その語形のみ） ---- */
  var POSTURE = ['膝をつく','膝をつい','膝をつき','倒れる','倒れた','倒れて','伏せる','伏せた','伏せて','横たわる','横たわっ'];
  /* ---- 次行動側（強い移動/立位） ---- */
  var LOCO    = ['走る','走っ','駆ける','駆け','歩き出す','歩き出し','立つ','立った'];
  /* ---- 起立・姿勢回復（同一 narrative 内にあれば除外） ---- */
  var RECOVER = ['立ち上が','起き上が','身を起こ'];
  /* ---- 比喩の除外（同一文に来たら その文の該当トークンを採らない・OBSERVED_ONLY の narrow guard） ---- */
  /* ★v1.1: 実測 karada「溝の縁で膝をつく。左脚に激痛が走る」から、痛み系は「痛み」ではなく「痛」で弾く。
     「霧」は cast 姓（霧 涼太）と衝突するため除外語から外した（本人の候補を潰さないため）。 */
  var META_LOCO = { '走': ['悪寒','戦慄','痛','電流','衝撃','緊張','震え','汗','痺れ','鳥肌'],
                    '立': ['鳥肌','音','波','湯気','腹が立','腹立','煙','角が立'] };

  var stats = { turnsSeen: 0, candidates: 0, droppedCount: 0, errors: 0,
                postureTurns: 0, postureKarada: 0, postureNarrative: 0,
                excludedByRecovery: 0, excludedByMetaphor: 0, skippedShortName: 0, last: null };
  var ring = [], seen = {};
  var prevPosture = null;   /* { turn: i, byWho: { who: {token, source} }, texts: {who: '…'} } */

  function push(c){ ring.push(c); while (ring.length > CAP){ ring.shift(); stats.droppedCount++; } }
  function remember(k){ seen[k] = 1; var ks = Object.keys(seen); while (ks.length > SEEN_CAP){ delete seen[ks.shift()]; } }
  function ls(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return ls('v292Dfix816Off') === '1'; }
  function on(){ return ls('v292Dfix816On') === '1' && !off(); }
  function nospace(s){ return String(s == null ? '' : s).replace(/[\s　]/g, ''); }
  function getS(){
    try { var a = window.__chronicleGetState ? window.__chronicleGetState('fix816') : null; if (a) return a; } catch(e){}
    try { return window.S || null; } catch(e){ return null; }
  }
  function getUI(){ try { return window.UI || (typeof UI !== 'undefined' ? UI : null); } catch(e){ return null; } }
  function knownNames(S){
    var out = [];
    try {
      if (S && S.cast){
        if (S.cast.hero && S.cast.hero.name) out.push(String(S.cast.hero.name));
        (S.cast.npcs || []).forEach(function(x){ if (x && x.name) out.push(String(x.name)); });
      }
    } catch(e){}
    return out;
  }
  function store(){ try { return window.__v292Dfix77Store || null; } catch(e){ return null; } }

  /* ---------- 純関数: 語彙 ---------- */
  function hit(text, list){ var t = String(text || ''); for (var i = 0; i < list.length; i++) if (t.indexOf(list[i]) >= 0) return list[i]; return null; }
  function metaphorBlocked(sentence, token){
    var head = token.charAt(0), bl = META_LOCO[head];
    if (!bl) return false;
    for (var i = 0; i < bl.length; i++) if (String(sentence).indexOf(bl[i]) >= 0) return true;
    return false;
  }
  function sentences(text){
    return String(text || '').split(/[。！？!?\n]/).map(function(s){ return s.trim(); }).filter(Boolean);
  }
  /* narrative から「正名が逐語で出る文」だけを取り、その文に語彙があるか見る。1 字名は不採用。 */
  function narrativeHit(narrative, name, list){
    var n = nospace(name);
    if (n.length < 2){ stats.skippedShortName++; return null; }
    var ss = sentences(narrative);
    for (var i = 0; i < ss.length; i++){
      if (ss[i].indexOf(name) < 0 && ss[i].indexOf(n) < 0) continue;
      var tk = hit(ss[i], list);
      if (!tk) continue;
      if (list === LOCO && metaphorBlocked(ss[i], tk)){ stats.excludedByMetaphor++; continue; }
      return { token: tk, sentence: ss[i].slice(0, 80) };
    }
    return null;
  }
  function karadaOf(st, who){ try { var r = st && st[who]; return r ? String(r.karada == null ? '' : r.karada) : ''; } catch(e){ return ''; } }

  /* ---------- 純関数: 1 対の turn から candidate を作る（テスト用に export） ---------- */
  /* ctx = { names:[], prev:{ narrative, store }, next:{ narrative, store }, turnFrom, turnTo } */
  function pairCandidates(ctx){
    var out = [], names = (ctx && ctx.names) || [];
    var pS = (ctx.prev && ctx.prev.store) || {}, nS = (ctx.next && ctx.next.store) || {};
    var pN = (ctx.prev && ctx.prev.narrative) || '', nN = (ctx.next && ctx.next.narrative) || '';
    for (var i = 0; i < names.length; i++){
      var name = names[i];
      /* 1) 前 turn に明示的な低姿勢・倒位（karada 優先・無ければ narrative の逐語名一致文） */
      var pk = karadaOf(pS, name), src = null, tok = null, ev = null;
      var t1 = hit(pk, POSTURE);
      if (t1){ src = 'karada'; tok = t1; ev = pk.slice(0, 80); }
      else { var nh = narrativeHit(pN, name, POSTURE); if (nh){ src = 'narrative'; tok = nh.token; ev = nh.sentence; } }
      if (!tok) continue;
      /* 2) 次 turn に強い移動/立位行動 */
      var nk = karadaOf(nS, name), lsrc = null, ltok = null, lev = null;
      var t2 = hit(nk, LOCO);
      if (t2 && metaphorBlocked(nk, t2)){ stats.excludedByMetaphor++; t2 = null; }
      if (t2){ lsrc = 'karada'; ltok = t2; lev = nk.slice(0, 80); }
      else { var lh = narrativeHit(nN, name, LOCO); if (lh){ lsrc = 'narrative'; ltok = lh.token; lev = lh.sentence; } }
      if (!ltok) continue;
      /* 3) 途中に起立・姿勢回復表現がない（前 turn の karada/narrative・次 turn の karada/narrative すべてを見る＝狭い側） */
      var rec = hit(pk, RECOVER) || hit(nk, RECOVER) || hit(pN, RECOVER) || hit(nN, RECOVER);
      if (rec){ stats.excludedByRecovery++; continue; }
      out.push({
        kind: 'POSTURE_TRANSITION_CANDIDATE',      /* ★violation ではない */
        who: name, turnFrom: ctx.turnFrom, turnTo: ctx.turnTo,
        posture: tok, postureSource: src, postureEvidence: ev,
        loco: ltok, locoSource: lsrc, locoEvidence: lev
      });
    }
    return out;
  }

  /* ---------- live hook ---------- */
  function snapshotPosture(S, narrative, ti){
    var names = knownNames(S), st = store() || {}, by = {}, any = false;
    for (var i = 0; i < names.length; i++){
      var name = names[i], k = karadaOf(st, name), t = hit(k, POSTURE);
      if (t){ by[name] = { token: t, source: 'karada' }; stats.postureKarada++; any = true; continue; }
      var nh = narrativeHit(narrative, name, POSTURE);
      if (nh){ by[name] = { token: nh.token, source: 'narrative' }; stats.postureNarrative++; any = true; }
    }
    if (any) stats.postureTurns++;
    return { turn: ti, byWho: by, narrative: String(narrative || ''), store: JSON.parse(JSON.stringify(st || {})) };
  }
  function onAppend(turn, idx){
    if (!on()) return;
    var S = getS(); if (!S || !turn) return;
    var ti = (typeof idx === 'number') ? idx : (S.turns ? S.turns.length - 1 : -1);
    stats.turnsSeen++;
    var narrative = String(turn.narrative || '');
    var st = store() || {};
    if (prevPosture && prevPosture.turn === ti - 1 && Object.keys(prevPosture.byWho).length){
      var cs = pairCandidates({
        names: Object.keys(prevPosture.byWho), turnFrom: prevPosture.turn, turnTo: ti,
        prev: { narrative: prevPosture.narrative, store: prevPosture.store },
        next: { narrative: narrative, store: st }
      });
      for (var i = 0; i < cs.length; i++){
        var key = cs[i].who + '@' + cs[i].turnFrom + '>' + cs[i].turnTo;
        if (seen[key]) continue;
        remember(key); push(cs[i]); stats.candidates++;
        try { console.log(TAG, 'POSTURE_TRANSITION_CANDIDATE', JSON.stringify(cs[i])); } catch(e){}
      }
      stats.last = { turnFrom: prevPosture.turn, turnTo: ti, n: cs.length };
    }
    prevPosture = snapshotPosture(S, narrative, ti);
  }
  function install(){
    var UI = getUI(); if (!UI) return false;
    if (UI.__v292Dfix816) return true;
    try {
      if (typeof UI.appendTurn === 'function'){
        var oa = UI.appendTurn.bind(UI);
        UI.appendTurn = function(t, i){
          var r = oa(t, i);                                   // 先に本来の処理（描画）・観測はその後
          try { onAppend(t, i); } catch(e){ stats.errors++; }
          return r;
        };
      }
    } catch(e){ stats.errors++; }
    UI.__v292Dfix816 = true;
    try { console.log(TAG, 'observer wired (read-only; default OFF; on=' + (on() ? '1' : '0') + ')'); } catch(e){}
    return true;
  }
  (function w(){ w._n = (w._n || 0) + 1; if (install()) return; if (w._n > 120) return; setTimeout(w, 500); })();

  window.__v292Dfix816 = {
    __v: 1.1,
    VOCAB: { POSTURE: POSTURE.slice(), LOCO: LOCO.slice(), RECOVER: RECOVER.slice() },
    /* READ-ONLY 検証口（純関数・書換 0） */
    pairCandidates: function(ctx){ return pairCandidates(ctx || {}); },
    hit: function(text, which){ return hit(text, which === 'LOCO' ? LOCO : (which === 'RECOVER' ? RECOVER : POSTURE)); },
    narrativeHit: function(n, name, which){ return narrativeHit(n, name, which === 'LOCO' ? LOCO : (which === 'RECOVER' ? RECOVER : POSTURE)); },
    stats: function(){ return JSON.parse(JSON.stringify(stats)); },
    list: function(){ return ring.slice(); },
    state: function(){ return { on: on(), off: off(), cap: CAP, seenCap: SEEN_CAP, prevTurn: prevPosture ? prevPosture.turn : null }; }
  };
  try { console.log(TAG, 'loaded (default OFF opt-in, read-only, candidate-only)'); } catch(e){}
})();
