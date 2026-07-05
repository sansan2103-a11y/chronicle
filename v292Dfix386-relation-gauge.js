// =====================================================================
// Chronicle TRPG - v292Dfix386: 関係の温度計（NPC同士の関係を蓄積して注入）
// おしんの次の一手 2026-07-04「NPC同士の関係をカルテ蓄積→1行注入」
// ---------------------------------------------------------------------
// 目的: NPC同士の関係（例: セイラ→ミア:負い目）を永続カルテに蓄積し、場面にいる
//   キャラ間の関係を1行ずつsysに注入する。「掛け合いに歴史が宿る」ための最小実装。
// 方式:
//   ・収穫(harvest): fix77Store(ライブ)とfix77States(localStorage永続)の新しい方(turn大)を
//     読み、各キャラの kankei 文字列を「相手名:記述」の組にパースして、fix277カルテ
//     (__v292QuasiPack)の qs[名前].rel = {相手名:{t,turn}} へ追記・更新して保存する
//     （_dropCacheは呼ばない・!document.hidden の時だけ保存＝fix377C実績方式）。
//     1キャラ最大4相手・古いturnから間引き。相手名は __v292AliasFix で正名化。
//     8秒ポーリング・S.turns.length変化時のみ処理。
//   ・注入(block): 直近2ターンのnarrative(+playerText)に名前が出るキャラを場面内とみなし、
//     NPC→（主人公またはNPC）の関係のみ最大4行を「セイラ→ミア: 負い目」形式で生成。
//     主人公→NPCはfix77の本来機能と重複するので除外（NPC視点の関係こそ死んでいた情報）。
//     fix379レジストリに prio:3 で登録（喪失レース知らず・予算超過時は真っ先に落ちる）。
// OFF: 既定プレビューOFF。localStorage v292Dfix386==='1' の時だけ収穫・注入とも動く。
//      全OFF: v292Dfix386Off==='1'（プレビューONでも停止）。
// 検証: window.__v292Dfix386x = { harvest, block, status }。node単体テストあり。
// =====================================================================
(function(){
  'use strict';
  if (window.__f386done) return; window.__f386done = 1;
  var TAG = '[v292Dfix386:relation-gauge]';
  var MAX_REL = 4;      // 1キャラが持てる関係(相手)の最大数
  var MAX_LINES = 4;    // sysに出す行の最大数
  var MAX_DESC = 60;    // 記述の最大文字数
  var TOTAL_CAP = 350;  // 注入ブロック全体の最大文字数

  function preview(){ try { return localStorage.getItem('v292Dfix386') === '1'; } catch(e){ return false; } }
  function off(){ try { return localStorage.getItem('v292Dfix386Off') === '1'; } catch(e){ return false; } }
  function active(){ return preview() && !off(); }
  function getS(){ try { return window.S || (0,eval)('typeof S!=="undefined" ? S : null'); } catch(e){ return null; } }

  // 相手名を正名化（AliasFixがあれば使う）。
  function canon(name){
    name = String(name || '').replace(/^[\s　]+|[\s　]+$/g, '');
    try {
      var A = window.__v292AliasFix;
      if (A){
        if (typeof A === 'function') return A(name) || name;
        if (typeof A.canon === 'function') return A.canon(name) || name;
        if (typeof A.resolve === 'function') return A.resolve(name) || name;
      }
    } catch(e){}
    return name;
  }

  // kankei文字列を [{peer, t}] にパースする。
  // 区切りは / ／ 、 のいずれもあり得る。「相手名:記述」の組。壊れた断片は捨てる。
  function parseKankei(str){
    var out = [];
    try {
      str = String(str || '');
      if (!str) return out;
      var parts = str.split(/[\/／、]/);
      for (var i = 0; i < parts.length; i++){
        var seg = String(parts[i] || '').replace(/^[\s　]+|[\s　]+$/g, '');
        if (!seg) continue;
        var m = seg.split(/[:：]/);
        if (m.length < 2) continue;              // コロンが無い＝断片、捨てる
        var peer = String(m[0] || '').replace(/^[\s　]+|[\s　]+$/g, '');
        var desc = m.slice(1).join(':').replace(/^[\s　]+|[\s　]+$/g, '');
        if (!peer || !desc) continue;            // どちらか空＝捨てる
        if (desc.length > MAX_DESC) desc = desc.slice(0, MAX_DESC);
        out.push({ peer: peer, t: desc });
      }
    } catch(e){}
    return out;
  }

  // fix77の状態を読む。ライブ(__v292Dfix77Store)と永続(localStorage v292Dfix77States)の
  // 新しい方(turn大)をキャラごとに採用して { 名前: {kankei, turn} } を返す。
  function readStates(){
    var merged = {};
    function absorb(src){
      if (!src || typeof src !== 'object') return;
      for (var name in src){
        if (!Object.prototype.hasOwnProperty.call(src, name)) continue;
        var e = src[name];
        if (!e || typeof e !== 'object') continue;
        var turn = (typeof e.turn === 'number') ? e.turn : 0;
        var prev = merged[name];
        if (!prev || turn >= prev.turn){
          merged[name] = { kankei: String(e.kankei || ''), turn: turn };
        }
      }
    }
    try { absorb(window.__v292Dfix77Store); } catch(e){}
    try {
      var raw = localStorage.getItem('v292Dfix77States');
      if (raw) absorb(JSON.parse(raw));
    } catch(e){}
    return merged;
  }

  // fix277カルテ(__v292QuasiPack)の生きたオブジェクトへ rel を追記・更新して保存する。
  function harvest(){
    if (!active()) return { ok: false, reason: 'inactive' };
    try {
      var QP = window.__v292QuasiPack;
      if (!QP || typeof QP.store !== 'function' || typeof QP.key !== 'function') {
        return { ok: false, reason: 'no-quasipack' };
      }
      var qs = QP.store();
      if (!qs || typeof qs !== 'object') return { ok: false, reason: 'no-store' };

      var states = readStates();
      var wrote = 0;
      for (var name in states){
        if (!Object.prototype.hasOwnProperty.call(states, name)) continue;
        var st = states[name];
        var rels = parseKankei(st.kankei);
        if (!rels.length) continue;
        var cname = canon(name);
        if (!qs[cname]) qs[cname] = { seen: [], ali: [] };
        if (!qs[cname].rel || typeof qs[cname].rel !== 'object') qs[cname].rel = {};
        var relObj = qs[cname].rel;
        for (var i = 0; i < rels.length; i++){
          var peer = canon(rels[i].peer);
          if (!peer || peer === cname) continue;   // 自分自身への関係は捨てる
          relObj[peer] = { t: rels[i].t, turn: st.turn };
          wrote++;
        }
        // 1キャラ最大4相手・古いturnから間引き。
        pruneRel(relObj);
      }

      if (wrote > 0 && !document.hidden){
        try { localStorage.setItem(QP.key(), JSON.stringify(qs)); } catch(e){}
      }
      try { console.log(TAG, 'harvest wrote', wrote); } catch(e){}
      return { ok: true, wrote: wrote };
    } catch(e){
      try { console.log(TAG, 'harvest error', e); } catch(e2){}
      return { ok: false, reason: 'error' };
    }
  }

  // relObj の相手数を MAX_REL に間引く（turnの小さい＝古い方から落とす）。
  function pruneRel(relObj){
    try {
      var keys = [];
      for (var k in relObj){
        if (Object.prototype.hasOwnProperty.call(relObj, k)) keys.push(k);
      }
      if (keys.length <= MAX_REL) return;
      keys.sort(function(a, b){
        var ta = (relObj[a] && typeof relObj[a].turn === 'number') ? relObj[a].turn : 0;
        var tb = (relObj[b] && typeof relObj[b].turn === 'number') ? relObj[b].turn : 0;
        return ta - tb; // 昇順（古い順）
      });
      var drop = keys.length - MAX_REL;
      for (var i = 0; i < drop; i++){ delete relObj[keys[i]]; }
    } catch(e){}
  }

  // 主人公名を取得。
  function heroName(){
    try {
      var S = getS();
      if (S && S.cast && S.cast.hero && S.cast.hero.name) return String(S.cast.hero.name);
    } catch(e){}
    return '';
  }

  // 直近2ターンのnarrative(+playerText)に名前が出ているキャラの集合（場面内）を返す。
  function sceneNames(){
    var set = {};
    try {
      var S = getS();
      if (!S || !Array.isArray(S.turns)) return set;
      var text = '';
      var start = Math.max(0, S.turns.length - 2);
      for (var i = start; i < S.turns.length; i++){
        var t = S.turns[i];
        if (!t) continue;
        if (typeof t.narrative === 'string') text += '\n' + t.narrative;
        if (typeof t.playerText === 'string') text += '\n' + t.playerText;
        if (Array.isArray(t._convSays)){
          for (var j = 0; j < t._convSays.length; j++){
            var cs = t._convSays[j];
            if (cs && typeof cs.say === 'string') text += '\n' + cs.say;
          }
        }
      }
      // 候補名: hero + npcs + カルテ登録名。text に含まれる名前を場面内とする。
      var cands = candidateNames();
      for (var n = 0; n < cands.length; n++){
        var nm = cands[n];
        if (nm && text.indexOf(nm) >= 0) set[nm] = true;
      }
    } catch(e){}
    return set;
  }

  // 場面内判定に使う候補名（hero・npcs・カルテ登録名）。
  function candidateNames(){
    var names = [];
    var seen = {};
    function add(n){ n = String(n || ''); if (n && !seen[n]){ seen[n] = true; names.push(n); } }
    try {
      var S = getS();
      if (S && S.cast){
        if (S.cast.hero && S.cast.hero.name) add(S.cast.hero.name);
        var ns = S.cast.npcs || [];
        for (var i = 0; i < ns.length; i++){ if (ns[i] && ns[i].name) add(ns[i].name); }
      }
    } catch(e){}
    try {
      var QP = window.__v292QuasiPack;
      if (QP && typeof QP.store === 'function'){
        var qs = QP.store() || {};
        for (var k in qs){ if (Object.prototype.hasOwnProperty.call(qs, k)) add(k); }
      }
    } catch(e){}
    return names;
  }

  // カルテからrel行を生成してsysブロック文字列を返す（注入なしなら''）。
  function block(){
    if (!active()) return '';
    try {
      var QP = window.__v292QuasiPack;
      if (!QP || typeof QP.store !== 'function') return '';
      var qs = QP.store() || {};
      var scene = sceneNames();
      var hero = heroName();
      var lines = [];
      // NPC→（主人公またはNPC）を対象。主人公が持つ関係は除外。
      for (var who in qs){
        if (!Object.prototype.hasOwnProperty.call(qs, who)) continue;
        if (who === hero) continue;              // 主人公が持つ関係は除外
        if (!scene[who]) continue;               // 主体が場面内にいない
        var entry = qs[who];
        var rel = entry && entry.rel;
        if (!rel || typeof rel !== 'object') continue;
        for (var peer in rel){
          if (!Object.prototype.hasOwnProperty.call(rel, peer)) continue;
          if (!scene[peer]) continue;            // 相手が場面内にいない
          if (peer === who) continue;
          var r = rel[peer];
          var desc = r && r.t ? String(r.t) : '';
          if (!desc) continue;
          lines.push({ line: who + '→' + peer + ': ' + desc, turn: (r && typeof r.turn === 'number') ? r.turn : 0 });
          if (lines.length >= MAX_LINES * 3) break; // 過剰収集を早めに打ち切る
        }
      }
      if (!lines.length) return '';
      // 新しい関係(turn大)を優先して最大MAX_LINES本。
      lines.sort(function(a, b){ return b.turn - a.turn; });
      var picked = [];
      for (var i = 0; i < lines.length && picked.length < MAX_LINES; i++){
        picked.push(lines[i].line);
      }
      var body = '\n【関係】' + picked.join('、') + '。この関係の温度を掛け合いと距離感に滲ませる（説明台詞にはしない）。';
      if (body.length > TOTAL_CAP) body = body.slice(0, TOTAL_CAP);
      try { console.log(TAG, 'block', picked.length, 'lines'); } catch(e){}
      return body;
    } catch(e){
      try { console.log(TAG, 'block error', e); } catch(e2){}
      return '';
    }
  }

  // status: relの現在値を返す。
  function status(){
    var out = {};
    try {
      var QP = window.__v292QuasiPack;
      if (QP && typeof QP.store === 'function'){
        var qs = QP.store() || {};
        for (var k in qs){
          if (!Object.prototype.hasOwnProperty.call(qs, k)) continue;
          if (qs[k] && qs[k].rel) out[k] = qs[k].rel;
        }
      }
    } catch(e){}
    return { preview: preview(), off: off(), rel: out };
  }

  // ---- 注入: fix379レジストリへ登録（喪失レース知らず・prio:3=任意=真っ先に予算落ち） ----
  window.__f379reg = window.__f379reg || [];
  window.__f379reg.push({ off: 'v292Dfix386Off', marker: '【関係】', prio: 3, text: block });

  // ---- 収穫: 8秒ポーリング・S.turns.length変化時のみ ----
  var lastLen = -1;
  function tick(){
    try {
      if (!active()) return;
      var S = getS();
      var len = (S && Array.isArray(S.turns)) ? S.turns.length : -1;
      if (len === lastLen) return;
      lastLen = len;
      harvest();
    } catch(e){}
  }
  try { setInterval(tick, 8000); } catch(e){}

  window.__v292Dfix386x = { harvest: harvest, block: block, status: status };
  // node単体テスト用に内部関数も露出（ブラウザ実害なし）
  try { window.__f386internal = { parseKankei: parseKankei, readStates: readStates, sceneNames: sceneNames, pruneRel: pruneRel }; } catch(e){}
  try { console.log(TAG, 'loaded (preview=' + (preview() ? '1' : '0') + ', off=' + (off() ? '1' : '0') + ')'); } catch(e){}
})();
