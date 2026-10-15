// =====================================================================
// Chronicle TRPG - v292Dfix970: state 出力 → fix77/fix190 取り込みの脱落位置を記録する shadow（既定 OFF）
// ---------------------------------------------------------------------
// GPT #127-P（OPTION_E_SHADOW = CONDITIONAL_LOCAL_GO・2026-10-15）
//   目的: モデルが出した <state> タグごとに、fix77 の取り込み・fix961 の保留・傷欄（fix190）の反映を
//         1 ターン単位で記録し、負傷の継続がどこで抜けるかを実プレイで測れるようにする。
//   挙動は一切変えない:
//     ・Planner.parsePlan は「生の応答を控えるだけ」で引数も戻り値も触らない（fix645 と同じ作法）。
//     ・保存・生成・状態・人物登録・turn オブジェクトには書かない（turn にフラグも付けない）。
//     ・取り込み結果は、ターン確定後に fix77 ストア / fix961 の保留記録を「読むだけ」で判定する。
//     ・追加の LLM 呼び出しなし。fetch には触らない。
//   記録しない: 本文・プロンプト・セリフの全文。残すのは who（24 字まで）と真偽値・ターン番号だけ。
//   測れないもの（unknown のまま・推測で埋めない）:
//     ・state を出力しなかった人物（匿名 NPC が出てこなかったこと）は、このログでは見えない
//     ・次ターンの sys へ状態が戻ったか（fix928/fix277 の注入）は見ない
//     ・生の応答とターン本文が一致しない（スロット切替・候補の破棄など）ときは rawMatch=false で中身を判定しない
//   記録先: メモリ（window.__v292Dfix970.log・最大 80 件）＋ アカウント×物語ごとの localStorage
//           'v292Dfix970Log_<ownerTag>_slot_<storyId>'（最大 40 件・書けなければ黙って諦める＝本処理へ影響なし）
//           ★GPT #127-Q A: ownerTag は iso2 の document の持ち主（ハッシュ済みの印・生の ID は使わない）。
//           持ち主が不明（未ログイン・食い違い・途中で切替）のときは永続保存しない（メモリにだけ残す）。
//   ★GPT #127-Q B: 生成時と確定時で story・持ち主が同じで、生の応答がそのターンの本文と一致したときだけ判定する。
//           それ以外は unknown（取り込み成功として数えない）。
//   ON : localStorage v292Dfix970On='1'（既定 OFF＝ラップも記録もしない）／ 停止: v292Dfix970Off='1'（On より優先）
//   検証口: window.__v292Dfix970 = { status(), log, parseTags(raw), injuryCue(s), classify(who), evaluate(...) }
// =====================================================================
(function(){
  'use strict';
  var G = (typeof window !== 'undefined') ? window : this;
  if (G.__v292Dfix970 && G.__v292Dfix970.__armed) return;
  var TAG = '[v292Dfix970:state-intake-shadow]';
  var MEM_MAX = 80, LS_MAX = 40, WHO_MAX = 24;

  function lsg(k){ try { return G.localStorage.getItem(k); } catch(e){ return null; } }
  function on(){ return lsg('v292Dfix970Off') !== '1' && lsg('v292Dfix970On') === '1'; }

  var stats = { wired: false, parses: 0, turnsEvaluated: 0, rawMismatch: 0, ctxChanged: 0, notPersistedNoOwner: 0, recordErrors: 0, lsWriteFail: 0, errors: 0 };
  var log = [];

  function getS(){
    try { if (typeof G.__chronicleGetState === 'function') return G.__chronicleGetState('fix970'); } catch(e){}
    try { return G.S || null; } catch(e){ return null; }
  }
  function storyId(){
    try { var m = String(G.location && G.location.search || '').match(/[?&]story=([^&#]+)/); return m ? decodeURIComponent(m[1]).slice(0, 40) : ''; } catch(e){ return ''; }
  }
  /* iso2 の document の持ち主（ハッシュ済みの印）。持ち主が確定していなければ null */
  function ownerTag(){
    try {
      var I = G.__v292Diso2; if (!I || typeof I.owner !== 'function') return null;
      var o = I.owner();
      if (!o || o.bad || !o.doc || o.doc === 'conflict' || o.docKind === 'anon' || o.docKind === 'conflict') return null;
      if (o.now !== o.doc) return null;   /* 途中でアカウントが変わった */
      return String(o.doc).slice(0, 40);
    } catch(e){ return null; }
  }
  function attr(tag, n){ var m = String(tag).match(new RegExp(n + '\\s*=\\s*"([^"]*)"')); return m ? m[1] : ''; }

  /* 純関数: 生の応答から <state> タグを取り出す */
  function parseTags(raw){
    var out = [], re = /<state\b[^>]*?\/?>/g, m, s = String(raw == null ? '' : raw);
    while ((m = re.exec(s)) !== null){
      var t = m[0];
      out.push({ who: attr(t, 'who').trim(), kizu: attr(t, '傷'), karada: attr(t, 'からだ') });
    }
    return out;
  }
  /* 純関数: 「明確な継続負傷」らしい語（診断候補。不具合の確定には使わない）。
     拘束・痛み・姿勢だけの語は含めない（GPT #127-P: 永続する傷と混同しない）。 */
  var INJ = /骨折|折れ|裂傷|切り傷|刺し傷|出血|血が|血を|流血|火傷|やけど|捻挫|脱臼|潰れ|潰し|潰さ|噛み傷|咬傷|打撲|傷口|縫/;
  function injuryCue(s){ return INJ.test(String(s || '')); }

  function castInfo(S){
    var hero = '', npcs = [];
    try { hero = String((S.cast && (S.cast.hero || S.cast.protagonist) && (S.cast.hero || S.cast.protagonist).name) || ''); } catch(e){}
    try { npcs = ((S.cast && S.cast.npcs) || []).map(function(n){ return String((n && n.name) || ''); }).filter(Boolean); } catch(e){}
    return { hero: hero, npcs: npcs };
  }
  function classify(who, ci){
    var w = String(who || '');
    if (!w) return 'empty';
    if (w === '主人公' || w === 'あなた' || (ci.hero && w === ci.hero)) return 'hero';
    if (ci.npcs.indexOf(w) >= 0) return 'cast';
    return 'non-cast';   // 準登録か匿名かは fix277 の内部状態なので、ここでは分けない（unknown 扱い）
  }

  /* 生の応答がこのターンのものか（fix645 の rawMatchesTurn と同じ考え方・読むだけ） */
  function norm(s){ return String(s == null ? '' : s).replace(/<[^>]*>/g, '').replace(/[\s　]/g, ''); }
  function rawMatchesTurn(raw, narr){
    var a = norm(String(raw == null ? '' : raw).split(/<react|<state|<scene_move/)[0]), b = norm(narr);
    var n = Math.min(20, a.length, b.length);
    if (n < 8) return false;
    var pos = [0, Math.floor(a.length / 3), Math.floor(a.length * 2 / 3)];
    for (var i = 0; i < pos.length; i++){
      var p = Math.min(pos[i], a.length - n), probe = a.substr(p, n);
      if (probe.length === n && b.indexOf(probe) >= 0) return true;
    }
    return a.indexOf(b.substr(0, n)) >= 0;
  }

  /* 純関数（検証口）: 1 ターン分の評価。store は fix77 ストア（読むだけ）、heldList は fix961 の保留記録 */
  function evaluate(raw, turnIdx, narr, store, ci, heldList, heldFrom){
    var row = { at: Date.now(), story: storyId(), turn: turnIdx, rawMatch: rawMatchesTurn(raw, narr), tags: [] };
    if (!row.rawMatch){ row.tags = null; return row; }
    var tags = parseTags(raw);
    var held = {};
    try { (heldList || []).slice(heldFrom || 0).forEach(function(h){ if (h && h.who) held[String(h.who)] = 1; }); } catch(e){}
    tags.forEach(function(t){
      var e = (store && t.who && Object.prototype.hasOwnProperty.call(store, t.who)) ? store[t.who] : null;
      var stTurn = (e && typeof e.turn === 'number') ? e.turn : null;
      row.tags.push({
        who: String(t.who).slice(0, WHO_MAX),
        kind: classify(t.who, ci),
        kizuAttr: !!(t.kizu && String(t.kizu).trim()),
        injuryCueKarada: injuryCue(t.karada),
        injuryCueKizu: injuryCue(t.kizu),
        held961: held[t.who] ? true : (heldList ? false : 'unknown'),
        stored: e ? true : false,
        storedThisTurn: (stTurn === null) ? 'unknown' : (stTurn === turnIdx || stTurn === turnIdx + 1),
        kizuStored: e ? !!(e.kizu && String(e.kizu).trim()) : false
      });
    });
    row.tagCount = tags.length;
    return row;
  }

  function record(row){
    try {
      log.push(row); if (log.length > MEM_MAX) log.splice(0, log.length - MEM_MAX);
      var sid = row.story; if (!sid) return;
      var ot = row.owner; if (!ot || ot !== ownerTag()){ stats.notPersistedNoOwner++; return; }   /* 持ち主が不明・変化 → 永続保存しない */
      var key = 'v292Dfix970Log_' + ot + '_slot_' + sid;
      try {
        var arr = []; try { arr = JSON.parse(G.localStorage.getItem(key) || '[]'); if (!Array.isArray(arr)) arr = []; } catch(_){ arr = []; }
        arr.push(row); if (arr.length > LS_MAX) arr = arr.slice(-LS_MAX);
        G.localStorage.setItem(key, JSON.stringify(arr));
      } catch(e){ stats.lsWriteFail++; }
    } catch(e){ stats.recordErrors++; }
  }

  /* ---- 配線: parsePlan で生の応答を控える → ターン確定を読むだけで待つ → 評価 ---- */
  var pending = null;   // { raw, idx, heldFrom, since }
  /* fix961 の保留記録（held() は写しを返す関数。無ければ null＝unknown） */
  function heldNow(){ try { var f = G.__v292Dfix961; if (f && typeof f.held === 'function') { var h = f.held(); return Array.isArray(h) ? h : null; } } catch(e){} return null; }
  function onParse(rawText){
    try {
      if (!on()) return;
      var S = getS(); var n = (S && Array.isArray(S.turns)) ? S.turns.length : null;
      if (n === null) return;
      var hl = heldNow(); hl = hl ? hl.length : null;
      pending = { raw: String(rawText == null ? '' : rawText), idx: n, heldFrom: hl, since: Date.now(), story: storyId(), owner: ownerTag() };
      stats.parses++;
    } catch(e){ stats.errors++; }
  }
  function tick(){
    try {
      if (!pending || !on()) return;
      if (Date.now() - pending.since > 180000){ pending = null; return; }   // 3 分で諦める（ターンにならなかった）
      var S = getS(); if (!S || !Array.isArray(S.turns)) return;
      if (S.turns.length <= pending.idx) return;                           // まだ確定していない
      var t = S.turns[pending.idx]; var narr = (t && typeof t.narrative === 'string') ? t.narrative : '';
      var row;
      if (pending.story !== storyId() || pending.owner !== ownerTag()){
        row = { at: Date.now(), story: storyId(), turn: pending.idx, rawMatch: false, tags: null, why: 'story-or-owner-changed' };   /* unknown */
        stats.ctxChanged++;
      } else {
        row = evaluate(pending.raw, pending.idx, narr, G.__v292Dfix77Store || null, castInfo(S), heldNow(), pending.heldFrom);
      }
      row.owner = pending.owner || null;
      if (!row.rawMatch) stats.rawMismatch++;
      pending = null;
      stats.turnsEvaluated++;
      record(row);
    } catch(e){ stats.errors++; pending = null; }
  }

  var timer = null;
  function wire(){
    try {
      if (!on()) return false;
      var P = G.Planner || ((typeof Planner !== 'undefined') ? Planner : null);
      if (!P || typeof P.parsePlan !== 'function') return false;
      if (!P.parsePlan.__f970){
        var orig = P.parsePlan;
        var w = function(rawText){ onParse(rawText); return orig.apply(this, arguments); };
        try { Object.keys(orig).forEach(function(k){ w[k] = orig[k]; }); } catch(e){}   // fix419c の掟
        w.__f970 = true;
        P.parsePlan = w;
      }
      if (!timer) timer = G.setInterval(tick, 1500);
      stats.wired = true;
      return true;
    } catch(e){ stats.errors++; return false; }
  }
  if (on()){
    var tries = 0, iv = G.setInterval(function(){ tries++; if (wire() || tries > 40) G.clearInterval(iv); }, 1000);
  }

  G.__v292Dfix970 = {
    __armed: true,
    status: function(){ return { on: on(), wired: stats.wired, parses: stats.parses, turnsEvaluated: stats.turnsEvaluated, rawMismatch: stats.rawMismatch, ctxChanged: stats.ctxChanged, notPersistedNoOwner: stats.notPersistedNoOwner, lsWriteFail: stats.lsWriteFail, recordErrors: stats.recordErrors, errors: stats.errors, pending: !!pending, logged: log.length, owner: !!ownerTag() }; },
    log: log, parseTags: parseTags, injuryCue: injuryCue, classify: classify, evaluate: evaluate,
    _tick: tick, _wire: wire
  };
  try { console.log(TAG, 'armed (default OFF; v292Dfix970On=1)'); } catch(e){}
})();
