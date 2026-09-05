// =====================================================================
// Chronicle TRPG - v292Dfix806: 4B-2 NPC consistency observer（観測のみ・in-memory・write 0）
// ---------------------------------------------------------------------
// GPT 裁定（2026-09-05 4B predesign v2 §6）: in-memory observer = GO。条件 =
//   localStorage write 0 / IDB write 0 / server write 0 / save payload 変更 0 / sys 変更 0 /
//   generation 内容への影響 0 / session reload で消えてよい。
//   「observer が『矛盾だ』と自動確定する必要はない — candidate observation として記録し人手で確定。」
// 観測対象（すべて candidate・修正ロジックなし）:
//   G  同一文内の 女性指示語 × 男性続柄（例: あの娘は…次男坊だ）／男性指示語 × 女性続柄
//   S  <state who> のキー（fix77/fix190 store）が cast / hero / quasi roster / fold のどれにも一致しない
//   K  関係（kankei）の相手名が未解決
//   P  話者 unknown('???') / 低 provenance（bare-inferred / harvest）枚数
// 契機: UI.appendTurn の **後**（fix616 が meta を付けた後・描画に影響しない）。過去 turn は走査しない。
// 読むもの: turn.narrative / turn._convSays / turn._convSayMeta / S.cast / window.__v292Dfix77Store /
//          localStorage（読取のみ: quasi roster・kill flag）/ window.__v292Dfix764.same（fold 同値）
// 書くもの: なし。window.__v292Dfix806（in-memory）だけ。
// 既定 OFF（opt-in v292Dfix806On='1'・GPT 裁定 B2: write 0 でも全 production turn で走る新 script = production-wide behavior なので v1 は opt-in）。kill: v292Dfix806Off='1'。
// bounded: candidate ring CAP ＋ droppedCount・dedupe map も上限（GPT 裁定 B2 追加条件）。fail-open: observer 例外で appendTurn を止めない。
// ★v1.2 RELATION_READ_MODEL_V1（GPT 裁定 2026-09-05 深夜224・GO_WITH_MINOR_CONTRACT_TIGHTENING・観測のみ）:
//   K を K_RESOLVED / K_UNRESOLVED / K_EPHEMERAL / K_UNKNOWN_LABEL に細分（相手名 resolve 3 段: cast/quasi exact(空白差) → fix277 aliasMap → fix764 fold）。
//   「・」複合相手は observer 内でだけ split（全 part resolve → K_RESOLVED／1 つでも未 → K_UNRESOLVED・parts は diagnostic）。
//   全角空白正規化は lookup 時のみ（store の who/kankei 文字列は 1 バイトも書換えない・alias 昇格 0）。
//   whoEvidence/partnerEvidence = turn.plan._v254who 参照 = CURRENT_TURN_ENTITY_EVIDENCE のみ（presence authority ではない）。
//   X = KNOWNTO_NONMEMBER_MEMORY_EXPOSURE_OBS: fix796 status().lastLog.knownToProvenance を READ し「Memory が sys に入った turn で、
//       current-turn evidence にある cast NPC がその record の knownTo に含まれない」件数を数えるだけ（nonmember ≠ ignorance・leak 判定/filter/FAIL に使わない・取得不能は no-op）。
//   FREEZE: PLANNER_RELATION_AUTHORITY_V1 = FIX190_KANKEI_STRING / K_EPHEMERAL は entity 登録候補ではない / ??? は relation endpoint ではない。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix806) return;
  var TAG = '[v292Dfix806:npc-observer]';
  var CAP = 128;      // candidate ring（in-memory・hard cap）
  var SEEN_CAP = 256; // dedupe map の上限（超えたら古い順に捨てる）
  var FEMALE_REF = ['彼女','少女','娘','妹','姉','母','婆','妻','嫁','女'];
  var MALE_KIN   = ['次男坊','次男','長男','三男','息子','弟','兄','父','爺','夫','男'];
  var MALE_REF   = ['彼','少年','息子','兄','弟','父','爺','夫','男'];
  var FEMALE_KIN = ['長女','次女','娘','妹','姉','母','婆','妻','嫁','女'];
  var COPULA = /(だ|です|である|なんだ|だった|でした)[。、」！？!?…\s]|(だ|です|である)$/;

  var stats = { turnsSeen: 0, G: 0, S: 0, K: 0, P_unknown: 0, P_lowprov: 0, droppedCount: 0, errors: 0, last: null,
                /* v1.2 */ K_RESOLVED: 0, K_UNRESOLVED: 0, K_EPHEMERAL: 0, K_UNKNOWN_LABEL: 0, compositeSeen: 0,
                S_UNKNOWN_LABEL: 0, S_EPHEMERAL: 0, X_turnsWithMemory: 0, X_records: 0, X_nonmember: 0, X_unavailable: 0 };
  var seenKall = {};   /* v1.2: who>partner → class（全 class を 1 度だけ ring へ） */
  var ring = [];
  var seenS = {}, seenK = {};
  function push(c){ ring.push(c); while (ring.length > CAP){ ring.shift(); stats.droppedCount++; } }
  function remember(map, key, v){ map[key] = v; var ks = Object.keys(map); while (ks.length > SEEN_CAP){ delete map[ks.shift()]; } }
  function ls(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return ls('v292Dfix806Off') === '1'; }
  function on(){ return ls('v292Dfix806On') === '1' && !off(); }
  function getS(){
    try { var a = window.__chronicleGetState ? window.__chronicleGetState('fix806') : null; if (a) return a; } catch(e){}
    try { return window.S || null; } catch(e){ return null; }
  }
  function getUI(){ try { return window.UI || (typeof UI !== 'undefined' ? UI : null); } catch(e){ return null; } }
  function nospace(s){ return String(s || '').replace(/[\s　]/g, ''); }
  function slotId(){
    try { var dk = window.__chronicleDocumentStoryKey; if (typeof dk === 'string' && dk) return String(dk).replace(/^chr6_slot_/, ''); } catch(e){}
    return '';
  }
  function quasiNames(){
    var id = slotId(); if (!id) return [];
    try {
      var raw = ls('v292Dfix277Quasi_slot_' + id); if (!raw) return [];
      var o = JSON.parse(raw);
      if (Array.isArray(o)) return o.map(function(x){ return (x && (x.name || x.key)) || x; }).filter(function(x){ return typeof x === 'string' && x; });
      return Object.keys(o || {});
    } catch(e){ return []; }
  }
  function knownNames(S){
    var out = [];
    try {
      if (S && S.cast){
        if (S.cast.hero && S.cast.hero.name) out.push(String(S.cast.hero.name));
        (S.cast.npcs || []).forEach(function(x){ if (x && x.name) out.push(String(x.name)); });
      }
    } catch(e){}
    return out.concat(quasiNames());
  }
  /* 名前解決（読取のみ）: 完全一致 → 空白差 → fix764 fold 同値 → 分割トークン一致（姓 or 名）。 */
  function resolves(name, known){
    var w = nospace(name); if (!w) return true;   // 空は対象外
    if (w === '???' || w === '主人公' || w === 'あなた') return true;
    var f764 = window.__v292Dfix764;
    for (var i = 0; i < known.length; i++){
      var k = nospace(known[i]);
      if (k === w) return true;
      try { if (f764 && typeof f764.same === 'function' && f764.same(k, w)) return true; } catch(e){}
      var parts = String(known[i]).split(/[\s　・]+/).filter(Boolean);
      for (var j = 0; j < parts.length; j++) if (parts[j].length >= 2 && parts[j] === w) return true;
    }
    return false;
  }
  function sentences(text){ return String(text || '').split(/(?<=[。！？!?\n」])/).map(function(s){ return s.trim(); }).filter(Boolean); }
  function firstHit(s, list){ for (var i = 0; i < list.length; i++) if (s.indexOf(list[i]) >= 0) return list[i]; return null; }

  /* ---------- G: 同一文内 指示語×続柄 の候補 ---------- */
  function observeG(turn, ti){
    var out = [];
    sentences(turn.narrative).forEach(function(s){
      if (!COPULA.test(s)) return;                      // 「X は Y だ」型の断定文だけ見る（描写文の同居は拾わない）
      /* ★v1.1（FIX806_G_TOKEN_BOUNDARY_FP・GPT 2026-09-05）: 「彼女」を 彼＋女 に分解して拾わない。
         彼女 は FEMALE_REF としてだけ扱い、男性指示語／女性続柄の走査は 彼女 を潰した文で行う。 */
      var s2 = s.replace(/彼女/g, '▲▲');
      var fr = firstHit(s, FEMALE_REF), mk = firstHit(s2, MALE_KIN);
      if (fr && mk && !(fr === '女' && mk === '男') && s.indexOf(fr) < s2.indexOf(mk))
        out.push({ kind: 'G', turn: ti, ref: fr, kin: mk, sentence: s.slice(0, 60) });
      var mr = firstHit(s2, MALE_REF), fk = firstHit(s2, FEMALE_KIN);
      if (mr && fk && !(mr === '男' && fk === '女') && s2.indexOf(mr) < s2.indexOf(fk) && !(fr && mk))
        out.push({ kind: 'G', turn: ti, ref: mr, kin: fk, sentence: s.slice(0, 60) });
    });
    return out;
  }
  /* ---------- S / K: fix77 store のキーと 関係 の相手名 ---------- */
  /* v1.2 helpers（全て読取・純関数）。 */
  var GENERIC_LABEL = /^(不明な.{0,6}|男|女|老人|老婆|少年|少女|子供|店主|通行人|男性|女性|声|誰か|人影|影|それ|彼|彼女|客|使い|使いの男|乗員|.{0,4}の(男|女|声|者|人|客|乗員))$/;
  function isUnknownLabel(n){ return /^[?？]+$/.test(nospace(n)); }
  function heroToken(n){ var w = nospace(n); return w === '主人公' || w === 'あなた' || w === '私' || w === '俺' || w === '僕'; }
  function aliasCanon(n){
    try { var Q = window.__v292QuasiPack; if (!Q || typeof Q.aliasMap !== 'function') return null;
          var m = Q.aliasMap() || {}; var w = nospace(n);
          if (m[n]) return String(m[n]); if (m[w]) return String(m[w]);
          var ks = Object.keys(m); for (var i = 0; i < ks.length; i++) if (nospace(ks[i]) === w) return String(m[ks[i]]);
    } catch(e){} return null;
  }
  /* 3 段 resolve: (1) cast/quasi exact（空白差・分割トークン）・fix764 fold（既存 resolves）→ (2) fix277 aliasMap → canonical が (1) で解ける → (3) hero token。
     戻り = { ok, via:'EXACT'|'ALIAS'|'HERO'|null } */
  function resolvePartner(n, known){
    var w = nospace(n); if (!w) return { ok: false, via: null };
    if (isUnknownLabel(w)) return { ok: false, via: null };
    if (heroToken(w)) return { ok: true, via: 'HERO' };
    if (resolves(w, known)) return { ok: true, via: 'EXACT' };
    var c = aliasCanon(n); if (c && resolves(c, known)) return { ok: true, via: 'ALIAS', canon: c };
    return { ok: false, via: null };
  }
  /* 話者証拠（current + previous turn の card who・say/react 由来）: ephemeral らしさの根拠。書換なし。 */
  function speakerWhos(S, ti){
    var set = {};
    try {
      var ts = (S && S.turns) || [];
      for (var k = ti; k >= 0 && k >= ti - 1; k--){ var t = ts[k]; if (!t) continue;
        (t._convSays || []).forEach(function(c){ if (c && c.who) set[nospace(c.who)] = 1; }); }
    } catch(e){}
    return set;
  }
  function evidence254(S, ti, name){
    /* CURRENT_TURN_ENTITY_EVIDENCE のみ（true/false/null=収穫なし）。完全一致 or 分割トークン一致（姓 or 名・2 字以上）。presence ではない。 */
    try { var t = S && S.turns && S.turns[ti]; var a = t && t.plan && t.plan._v254who;
          if (!Array.isArray(a)) return null; var w = nospace(name); if (!w) return false;
          for (var i = 0; i < a.length; i++){ var e = String(a[i] || ''); if (nospace(e) === w) return true;
            var parts = e.split(/[\s　・]+/).filter(Boolean); for (var j = 0; j < parts.length; j++) if (parts[j].length >= 2 && parts[j] === w) return true; }
          return false; } catch(e){ return null; }
  }
  /* 単一 part の分類 */
  function classifyOne(part, known, spk){
    var w = nospace(part);
    if (!w) return { cls: 'K_UNRESOLVED', via: null };
    if (isUnknownLabel(w)) return { cls: 'K_UNKNOWN_LABEL', via: null };
    var r = resolvePartner(part, known);
    if (r.ok) return { cls: 'K_RESOLVED', via: r.via, canon: r.canon || null };
    if (spk[w] || GENERIC_LABEL.test(w)) return { cls: 'K_EPHEMERAL', via: null, reason: spk[w] ? 'SPEAKER_EVIDENCE' : 'GENERIC_LABEL' };
    return { cls: 'K_UNRESOLVED', via: null };
  }
  /* 相手名（複合可）の分類。「・」は observer 内でだけ split。集約 = 全 part RESOLVED → K_RESOLVED／??? を含む → K_UNKNOWN_LABEL／単一 part はそのまま／複合で 1 つでも未 → K_UNRESOLVED。 */
  function classifyPartner(partner, known, spk){
    var raw = String(partner || '');
    var parts = raw.split(/・/).map(function(x){ return x.trim(); }).filter(Boolean);
    if (!parts.length) return { cls: 'K_UNRESOLVED', parts: [] };
    var det = parts.map(function(p){ var c = classifyOne(p, known, spk); c.part = p; return c; });
    if (det.length === 1) return { cls: det[0].cls, via: det[0].via, reason: det[0].reason || null, parts: det, composite: false };
    var anyUnknown = det.some(function(d){ return d.cls === 'K_UNKNOWN_LABEL'; });
    var allResolved = det.every(function(d){ return d.cls === 'K_RESOLVED'; });
    return { cls: anyUnknown ? 'K_UNKNOWN_LABEL' : (allResolved ? 'K_RESOLVED' : 'K_UNRESOLVED'), parts: det, composite: true };
  }
  function classifyWho(who, known, spk){
    var w = nospace(who);
    if (isUnknownLabel(w)) return 'S_UNKNOWN_LABEL';
    if (resolves(w, known) || (aliasCanon(who) && resolves(aliasCanon(who), known))) return 'S_RESOLVED';
    if (spk[w] || GENERIC_LABEL.test(w)) return 'S_EPHEMERAL';
    return 'S_UNRESOLVED';
  }
  function observeSK(S, ti){
    var out = [], st = null;
    try { st = window.__v292Dfix77Store || null; } catch(e){ st = null; }
    if (!st || typeof st !== 'object') return out;
    var known = knownNames(S);
    var spk = speakerWhos(S, ti);
    Object.keys(st).forEach(function(who){
      var sc = classifyWho(who, known, spk);
      if (sc !== 'S_RESOLVED' && !seenS[who]){
        remember(seenS, who, { turn: ti });
        var rec = { kind: 'S', turn: ti, who: who, cls: sc, whoEvidence: evidence254(S, ti, who) };
        if (sc === 'S_UNKNOWN_LABEL') stats.S_UNKNOWN_LABEL++; if (sc === 'S_EPHEMERAL') stats.S_EPHEMERAL++;
        out.push(rec);
      }
      var kk = st[who] && st[who].kankei ? String(st[who].kankei) : '';
      if (!kk) return;
      kk.split(/[／\/;；、]/).forEach(function(seg){
        var m = seg.match(/^\s*([^:：]{1,24}?)\s*[:：]/); if (!m) return;     /* v1.2: 相手名の内部空白（全角含む）を許容（lookup 時に nospace） */
        var partner = m[1].trim();
        var c = classifyPartner(partner, known, spk);
        var key = who + '>' + partner;
        if (seenKall[key] === c.cls) return;               /* 同じ相手・同じ分類は 1 度だけ */
        remember(seenKall, key, c.cls);
        if (c.composite) stats.compositeSeen++;
        stats[c.cls] = (stats[c.cls] || 0) + 1;
        if (!seenK[key] && c.cls !== 'K_RESOLVED'){ remember(seenK, key, { turn: ti }); }
        out.push({ kind: 'K', turn: ti, who: who, partner: partner, cls: c.cls, via: c.via || null, reason: c.reason || null,
                   parts: c.composite ? c.parts.map(function(d){ return { part: d.part, cls: d.cls, via: d.via || null }; }) : null,
                   whoEvidence: evidence254(S, ti, who), partnerEvidence: evidence254(S, ti, partner) });
      });
    });
    return out;
  }
  /* ---------- X: KNOWNTO_NONMEMBER_MEMORY_EXPOSURE_OBS（fix796 provenance log の READ・判定/filter 0・取得不能 no-op） ---------- */
  function observeX(S, ti){
    var out = [];
    try {
      var F = window.__v292Dfix796; if (!F || typeof F.status !== 'function') { stats.X_unavailable++; return out; }
      var st = F.status(); var log = st && st.lastLog;
      if (!log || !Array.isArray(log.knownToProvenance)) { stats.X_unavailable++; return out; }
      if (log.turn != null && typeof log.turn === 'number' && ti >= 0 && log.turn !== ti && log.turn !== ti + 1 && log.turn !== ti - 1) { stats.X_unavailable++; return out; } /* 別 turn の log は読まない */
      if (!log.knownToProvenance.length) return out;
      stats.X_turnsWithMemory++;
      var t = S && S.turns && S.turns[ti]; var ev = (t && t.plan && Array.isArray(t.plan._v254who)) ? t.plan._v254who : [];
      var npcs = []; try { (S.cast.npcs || []).forEach(function(n){ if (n && n.name && ev.some(function(e){ return nospace(e) === nospace(n.name); })) npcs.push(String(n.name)); }); } catch(e){}
      log.knownToProvenance.forEach(function(rec){
        stats.X_records++;
        var kt = (rec && Array.isArray(rec.knownTo)) ? rec.knownTo.map(function(x){ var s = String(x || ''); var i = s.lastIndexOf(':'); return nospace(i >= 0 ? s.slice(i + 1) : s); }) : [];
        npcs.forEach(function(n){
          if (kt.indexOf(nospace(n)) < 0){ stats.X_nonmember++; out.push({ kind: 'X', turn: ti, npc: n, memoryId: rec && rec.memoryId, knownToN: kt.length }); }
        });
      });
    } catch(e){ stats.X_unavailable++; }
    return out;
  }
  /* ---------- P: 話者 provenance 集計 ---------- */
  function observeP(turn){
    var cs = turn._convSays || [], mm = Array.isArray(turn._convSayMeta) ? turn._convSayMeta : [];
    var unk = 0, low = 0;
    for (var i = 0; i < cs.length; i++){
      var c = cs[i]; if (!c) continue;
      if (String(c.who || '') === '???') unk++;
      var sk = mm[i] && mm[i].sourceKind; if (sk === 'bare-inferred' || sk === 'harvest') low++;
    }
    return { unknown: unk, lowprov: low, cards: cs.length };
  }

  function onAppend(turn, idx){
    if (!on()) return;
    var S = getS(); if (!S || !turn) return;
    var ti = (typeof idx === 'number') ? idx : (S.turns ? S.turns.length - 1 : -1);
    stats.turnsSeen++;
    var g = observeG(turn, ti), sk = observeSK(S, ti), p = observeP(turn), x = observeX(S, ti);
    g.forEach(push); sk.forEach(push); x.forEach(push);
    stats.G += g.length; sk.forEach(function(r){ if (r.kind === 'S') stats.S++; else stats.K++; });
    stats.P_unknown += p.unknown; stats.P_lowprov += p.lowprov;
    stats.last = { turn: ti, G: g.length, S: sk.filter(function(r){ return r.kind === 'S'; }).length, K: sk.filter(function(r){ return r.kind === 'K'; }).length, X: x.length, P: p };
    if (g.length || sk.length || x.length){ try { console.log(TAG, 'candidates', JSON.stringify(g.concat(sk, x))); } catch(e){} }
  }
  function install(){
    var UI = getUI(); if (!UI) return false;
    if (UI.__v292Dfix806) return true;
    try {
      if (typeof UI.appendTurn === 'function'){
        var oa = UI.appendTurn.bind(UI);
        UI.appendTurn = function(turn, idx){
          var r = oa(turn, idx);                              // 先に本来の処理（描画）・観測はその後
          try { onAppend(turn, idx); } catch(e){ stats.errors++; }
          return r;
        };
      }
    } catch(e){ stats.errors++; }
    UI.__v292Dfix806 = true;
    try { console.log(TAG, 'observer wired (read-only; default OFF; on=' + (on() ? '1' : '0') + ')'); } catch(e){}
    return true;
  }
  (function w(){ w._n = (w._n || 0) + 1; if (install()) return; if (w._n > 120) return; setTimeout(w, 500); })();

  window.__v292Dfix806 = {
    __v: 1.2,
    /* v1.2 READ-ONLY 検証口（純関数・書換 0） */
    classifyPartner: function(partner, S, ti){ S = S || getS(); return classifyPartner(partner, knownNames(S), speakerWhos(S, (typeof ti === 'number') ? ti : ((S && S.turns) ? S.turns.length - 1 : -1))); },
    classifyWho: function(who, S, ti){ S = S || getS(); return classifyWho(who, knownNames(S), speakerWhos(S, (typeof ti === 'number') ? ti : ((S && S.turns) ? S.turns.length - 1 : -1))); },
    observeX: function(S, ti){ S = S || getS(); return observeX(S, (typeof ti === 'number') ? ti : ((S && S.turns) ? S.turns.length - 1 : -1)); },
    stats: function(){ return JSON.parse(JSON.stringify(stats)); },
    candidates: function(){ return ring.slice(); },
    observe: function(turn, S, ti){ S = S || getS(); var t = (typeof ti === 'number') ? ti : -1; return { G: observeG(turn, t), SK: observeSK(S, t), P: observeP(turn), X: observeX(S, t) }; },   // READ-ONLY・任意 turn
    state: function(){ return { on: on(), off: off(), cap: CAP, seenCap: SEEN_CAP }; }
  };
  try { console.log(TAG, 'loaded (default OFF opt-in, read-only)'); } catch(e){}
})();
