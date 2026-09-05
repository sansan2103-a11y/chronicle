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

  var stats = { turnsSeen: 0, G: 0, S: 0, K: 0, P_unknown: 0, P_lowprov: 0, droppedCount: 0, errors: 0, last: null };
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
  function observeSK(S, ti){
    var out = [], st = null;
    try { st = window.__v292Dfix77Store || null; } catch(e){ st = null; }
    if (!st || typeof st !== 'object') return out;
    var known = knownNames(S);
    Object.keys(st).forEach(function(who){
      if (!resolves(who, known) && !seenS[who]){ remember(seenS, who, { turn: ti }); out.push({ kind: 'S', turn: ti, who: who }); }
      var kk = st[who] && st[who].kankei ? String(st[who].kankei) : '';
      if (!kk) return;
      kk.split(/[／\/;；、]/).forEach(function(seg){
        var m = seg.match(/^\s*([^:：\s]{1,12})\s*[:：]/); if (!m) return;
        var partner = m[1];
        if (!resolves(partner, known)){ var key = who + '>' + partner; if (!seenK[key]){ remember(seenK, key, { turn: ti }); out.push({ kind: 'K', turn: ti, who: who, partner: partner }); } }
      });
    });
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
    var g = observeG(turn, ti), sk = observeSK(S, ti), p = observeP(turn);
    g.forEach(push); sk.forEach(push);
    stats.G += g.length; sk.forEach(function(x){ if (x.kind === 'S') stats.S++; else stats.K++; });
    stats.P_unknown += p.unknown; stats.P_lowprov += p.lowprov;
    stats.last = { turn: ti, G: g.length, S: sk.filter(function(x){ return x.kind === 'S'; }).length, K: sk.filter(function(x){ return x.kind === 'K'; }).length, P: p };
    if (g.length || sk.length){ try { console.log(TAG, 'candidates', JSON.stringify(g.concat(sk))); } catch(e){} }
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
    __v: 1.1,
    stats: function(){ return JSON.parse(JSON.stringify(stats)); },
    candidates: function(){ return ring.slice(); },
    observe: function(turn, S){ S = S || getS(); return { G: observeG(turn, -1), SK: observeSK(S, -1), P: observeP(turn) }; },   // READ-ONLY・任意 turn
    state: function(){ return { on: on(), off: off(), cap: CAP, seenCap: SEEN_CAP }; }
  };
  try { console.log(TAG, 'loaded (default OFF opt-in, read-only)'); } catch(e){}
})();
