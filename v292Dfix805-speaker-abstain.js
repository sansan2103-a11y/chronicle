// =====================================================================
// Chronicle TRPG - v292Dfix805: speaker abstention layer（4B-1・案 P）
// ---------------------------------------------------------------------
// 製品原則（GPT ACCEPT 2026-09-05）:
//   "Unsupported attribution must abstain rather than fabricate identity."
//   根拠のない話者確定より、話者不明('???')を選ぶ。
//
// 位置づけ:
//   fix606（分類）→ fix616（_convSayMeta 永続）→ fix611（判定）→ fix620（適用）の既存 4 段に
//   「低 provenance で正の話者証拠が 0 のカードを '???' へ倒す」1 段を足すだけ。
//   ★話者 resolver ではない。誰かへの振替・逆方向（'???'→名前）は一切しない。
//
// 契約（GPT 固定・2026-09-05）:
//   変更可能 ⇔ 新ターン（UI.appendTurn 経由 = TURN_COMMIT 直後の 1 回）
//            ∧ sourceKind ∈ {bare-inferred, harvest}
//            ∧ card.who が concrete（'???'/空 以外） ∧ card._rv !== 1
//            ∧ fix469 score で当該 who（とその正準名）に正の証拠が 0
//   触らないもの: say 本文／turn 本文／_convSays 枚数・順序／_convSayMeta／過去ターン／
//                say-tag・react-voice カード／canonical Entity Identity／Memory record。
//   書込経路: S.save() のみ（fix616 の save に相乗りできる時は自分では呼ばない）。
//
// 実測根拠（4B-0 baseline・実 story smrj0rvnuup T27–58）:
//   bare-inferred 30 枚中 明白誤 17（R-HERO 12 / R-ONE 2 / R-ENT 4 / R-HARV 1）。
//   例: 源蔵の語りが主人公名義（hero-default）／「人形」「悪霊」= entityNouns 単独候補の誤確定。
//   fix680 E（planDemote）は「反証あり」でしか '???' にしないため、これらは全部すり抜ける。
//
// 既定 OFF（opt-in）: localStorage v292Dfix805On='1' で有効。kill: v292Dfix805Off='1'。
// 観測口（in-memory のみ・永続化しない）: window.__v292Dfix805 = { plan, dryRun, stats, state, reasons, selfTest }
//   ・dryRun(turnIndex) は任意ターンを READ-ONLY で判定するだけ（replay 用）。過去ターンへ書く API は無い。
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix805) return;
  var TAG = '[v292Dfix805:speaker-abstain]';
  var GATE = { 'bare-inferred': 1, 'harvest': 1 };
  var UNKNOWN = '???';
  /* label 専用（判定には使わない）。index.html _LANGS217.ja.entityNouns の写し。 */
  var ENTITY_NOUNS = { '妖怪':1,'怪異':1,'化け物':1,'怪物':1,'魔物':1,'悪霊':1,'亡霊':1,'幽霊':1,'人形':1 };
  var HERO_SURFACE = { 'あなた': 1, '主人公': 1 };

  var R = {
    // KEEP_ALL（turn 単位・fail-closed）
    OFF: 'OFF', NOT_LAST_TURN: 'NOT_LAST_TURN', NOT_SESSION_NEW: 'NOT_SESSION_NEW', NO_CARDS: 'NO_CARDS',
    META_UNAVAILABLE: 'META_UNAVAILABLE', META_MISALIGNED: 'META_MISALIGNED', NO_469: 'NO_469', NAMES_LT3: 'NAMES_LT3', THREW: 'THREW',
    // KEEP（card 単位）
    HIGH_PROVENANCE: 'HIGH_PROVENANCE', REACT_VOICE: 'REACT_VOICE', ALREADY_UNKNOWN: 'ALREADY_UNKNOWN',
    PLAYER_SAY: 'PLAYER_SAY', LINE_NOT_FOUND: 'LINE_NOT_FOUND', POSITIVE_EVIDENCE: 'POSITIVE_EVIDENCE',
    // ABSTAIN（card 単位・prefix）
    NO_EVIDENCE: 'NO_EVIDENCE', NEGATIVE_EVIDENCE: 'NEGATIVE_EVIDENCE',
    // origin（label）
    HERO_DEFAULT: 'HERO_DEFAULT', ENTITY_NOUN_ONLY: 'ENTITY_NOUN_ONLY', NOT_IN_CAST: 'NOT_IN_CAST', SINGLE_CANDIDATE_OR_UNKNOWN: 'SINGLE_CANDIDATE_OR_UNKNOWN'
  };

  var stats = { turnsSeen: 0, turnsPlanned: 0, keepAll: {}, keep: {}, abstain: {}, abstained: 0, cardsSeen: 0,
                saves: 0, reliedOnFix616Save: 0, errors: 0, last: null };
  function bump(map, k){ map[k] = (map[k] || 0) + 1; }

  function ls(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return ls('v292Dfix805Off') === '1'; }
  function on(){ return ls('v292Dfix805On') === '1' && !off(); }

  function getS(){
    try { var a = window.__chronicleGetState ? window.__chronicleGetState('fix805') : null; if (a) return a; } catch(e){}
    try { return window.S || null; } catch(e){ return null; }
  }
  function getUI(){ try { return window.UI || (typeof UI !== 'undefined' ? UI : null); } catch(e){ return null; } }
  function nospace(s){ return String(s || '').replace(/[\s　]/g, ''); }
  /* 引用行照合用の正規化。fix606 loose()（PUNCT_RE）と同じ範囲＝句読点・三点リーダ・ダッシュ類・引用符を落とす。
     実測（replay smrj0rvnuup T30-1）: card.say「年の頃は、二十五」vs 本文「年の頃は——二十五」= ダッシュ⇄読点の表記差で
     fix680 流の normQ では LINE_NOT_FOUND になっていた。判定側でなく照合側だけの正規化。 */
  function normQ(s){ return String(s || '').replace(/[\s　。、，．・…‥ー―—－\-!?！？"'“”゛゜~〜「」『』]/g, ''); }
  function heroCanon(S){
    var n = '';
    try { n = (S && S.cast && S.cast.hero && S.cast.hero.name) ? String(S.cast.hero.name).trim() : ''; } catch(e){}
    return n;
  }
  function castNames(S){
    var out = [];
    try {
      if (S && S.cast){
        if (S.cast.hero && S.cast.hero.name) out.push(String(S.cast.hero.name).trim());
        (S.cast.npcs || []).forEach(function(x){ if (x && x.name) out.push(String(x.name).trim()); });
      }
    } catch(e){}
    return out;
  }
  /* who → 候補名の正準形。tokensOf の分割トークン（涼太／霧）や主人公表層形（あなた）を吸収する。
     ★判定を「甘く」する方向（正証拠を見つけやすくする＝KEEP 側）にしか働かない。 */
  function canonOf(who, names, tok, hero){
    var w = nospace(who); if (!w) return null;
    if (HERO_SURFACE[w] && hero) return hero;
    for (var i = 0; i < names.length; i++) if (nospace(names[i]) === w) return names[i];
    for (var j = 0; j < tok.length; j++) if (tok[j] && nospace(tok[j].tok) === w) return tok[j].canon;
    return null;
  }
  function originOf(who, hero, castSet){
    var w = nospace(who);
    if (hero && (w === nospace(hero) || HERO_SURFACE[w])) return R.HERO_DEFAULT;
    if (ENTITY_NOUNS[w] && !castSet[w]) return R.ENTITY_NOUN_ONLY;
    if (!castSet[w]) return R.NOT_IN_CAST;
    return R.SINGLE_CANDIDATE_OR_UNKNOWN;
  }
  /* 引用行の特定: ①行全体一致 → ②包含（中身 3 字以上のときだけ。fix617 の教訓＝短い悲鳴を包含照合しない）。
     見つからなければ LINE_NOT_FOUND = KEEP（fail-closed）。 */
  /* ★Fable red-team D2: 同文行が複数ある時は**全部**返す（最初の行だけ採点すると、証拠が在る行を見ずに '???' へ倒す）。 */
  function locateAll(L, nq){
    var i, l, out = [];
    for (i = 0; i < L.length; i++){ l = normQ(L[i]); if (l && l === nq) out.push(i); }
    if (nq.length < 3) return out;                                  // 短い中身は包含照合しない（fix617）
    for (i = 0; i < L.length; i++){ l = normQ(L[i]); if (l && l !== nq && l.indexOf(nq) >= 0) out.push(i); }   // 全体一致行 ∪ 包含行（証拠が在る行を取りこぼさない）
    return out;
  }
  /* 同一行の「引用以外の残り」。raw の say がその行に部分文字列として在れば前後に分ける。
     無ければ「…」『…』を全部落とした残りを whole として返す（前後どちらの文脈としても採点する）。 */
  function sameLineRest(line, say){
    var s = String(line || ''), q = String(say || '').trim();
    var out = { before: '', after: '', whole: '' };
    if (!s) return out;
    var p = q ? s.indexOf(q) : -1;
    if (p >= 0){
      out.before = s.slice(0, p).trim();
      out.after = s.slice(p + q.length).trim();
      return out;
    }
    var w = s.replace(/[「『][^」』]*[」』]/g, '').trim();
    if (w && w !== s.trim()) out.whole = w;
    return out;
  }
  function metaFor(turn, cs, hero){
    var mm = turn._convSayMeta;
    if (Array.isArray(mm)){
      if (mm.length !== cs.length) return { ok: false, why: R.META_MISALIGNED };
      return { ok: true, meta: mm, persisted: true };
    }
    /* fix616 がまだ付けていない（本 fix が外側で先に走った）時は、fix616 と同じ純関数で同じ分類を得る。 */
    var f616 = window.__v292Dfix616;
    if (!f616 || typeof f616.buildMeta !== 'function') return { ok: false, why: R.META_UNAVAILABLE };
    var r = null;
    try { r = f616.buildMeta(turn, hero); } catch(e){ return { ok: false, why: R.META_UNAVAILABLE }; }
    if (!r || !r.ok || !Array.isArray(r.meta) || r.meta.length !== cs.length) return { ok: false, why: R.META_UNAVAILABLE };
    return { ok: true, meta: r.meta, persisted: false };
  }

  /* ---------- 計画（純関数・副作用なし） ----------
     返り値 { ok, reason?, items:[{idx, who, sourceKind, action:'ABSTAIN'|'KEEP', reason, cur}], metaPersisted } */
  function plan(turn, S, opts){
    opts = opts || {};
    var items = [];
    function keepAll(why){ return { ok: false, reason: why, items: items }; }
    if (!turn || !S || !Array.isArray(S.turns)) return keepAll(R.THREW);
    if (!opts.allowAnyTurn){
      if (S.turns[S.turns.length - 1] !== turn) return keepAll(R.NOT_LAST_TURN);
      /* fix732 session-turn-scope（RULING85）を「new turn」の唯一の根拠にする。
         ★Fable red-team D1: scope 不在時に検査を省略すると fail-open になる → 不在も NOT_SESSION_NEW（全 KEEP）。 */
      var scope = window.__v292Dfix732Scope;
      var isNew = false;
      try { isNew = !!(scope && scope.__armed && typeof scope.isNew === 'function' && scope.isNew(turn)); } catch(e){ isNew = false; }
      if (!isNew) return keepAll(R.NOT_SESSION_NEW);
    }
    var cs = turn._convSays || [];
    if (!cs.length) return keepAll(R.NO_CARDS);
    var hero = heroCanon(S);
    var m = metaFor(turn, cs, hero);
    if (!m.ok) return keepAll(m.why);
    var f = window.__v292Dfix469;
    if (!f || !f.__armed || typeof f.score !== 'function' || typeof f.tokensOf !== 'function') return keepAll(R.NO_469);
    var f680 = window.__v292Dfix680;
    var ns = null;
    try { ns = (f680 && typeof f680.names === 'function') ? f680.names(S) : null; } catch(e){ ns = null; }
    if (!Array.isArray(ns) || ns.length < 3) return keepAll(R.NAMES_LT3);
    var tok, profs, all;
    try {
      tok = f.tokensOf(ns); profs = (typeof f.profiles === 'function') ? f.profiles(S) : [];
      all = tok.concat(typeof f.extraTokens === 'function' ? f.extraTokens({ narrative: turn.narrative, _convSays: cs }, ns, turn.narrative) : []);
    } catch(e){ return keepAll(R.THREW); }
    var castSet = {}; castNames(S).forEach(function(n){ castSet[nospace(n)] = 1; });
    var L = String(turn.narrative || '').split('\n');
    var isSay = String(turn.inputType || '').toUpperCase() === 'SAY';
    var pt = normQ(turn.playerText);
    for (var j = 0; j < cs.length; j++){
      var c = cs[j], mj = m.meta[j];
      var sk = (mj && mj.sourceKind) || 'none';
      var who = c && c.who != null ? String(c.who) : '';
      var it = { idx: j, who: who, sourceKind: sk, action: 'KEEP', reason: '', cur: null };
      items.push(it);
      if (!c){ it.reason = R.HIGH_PROVENANCE; continue; }
      if (c._rv === 1){ it.reason = R.REACT_VOICE; continue; }           // 聖域（index.html _rv）: sourceKind より先に見る
      if (!GATE[sk]){ it.reason = R.HIGH_PROVENANCE; continue; }
      if (!nospace(who) || who === UNKNOWN){ it.reason = R.ALREADY_UNKNOWN; continue; }
      var nq = normQ(c.say);
      if (!nq){ it.reason = R.LINE_NOT_FOUND; continue; }
      if (isSay && pt && (nq === pt || nq.indexOf(pt) >= 0 || pt.indexOf(nq) >= 0)){ it.reason = R.PLAYER_SAY; continue; }   // fix606 hero-utterance と同じ包含（Fable R2）
      var ats = locateAll(L, nq);
      if (!ats.length){ it.reason = R.LINE_NOT_FOUND; continue; }
      /* 証拠の取り方（KEEP 側に甘く）: 一致した全行について、前後行（fix469/fix680 と同じ）に加え、
         同一行の残り（「…」と X が言った／X は言った。「…」）も文脈として採点し、最大値を採る。
         fix469 の findLine は「行全体が引用」しか見ないため、同一行帰属は fix680 E でも 0 点になっていた。
         ここで見ないと Q03 型（と C が言った）を誤って '???' にする。 */
      var ctxs = [];
      for (var a = 0; a < ats.length; a++){
        var at = ats[a];
        ctxs.push([at > 0 ? L[at - 1] : '', at + 1 < L.length ? L[at + 1] : '']);
        var rest = sameLineRest(L[at], c.say);
        if (rest.before || rest.after) ctxs.push([rest.before || '', rest.after || '']);
        if (rest.whole){ ctxs.push([rest.whole, '']); ctxs.push(['', rest.whole]); }   // 二重加点しない（片側ずつ）
      }
      var canon = canonOf(who, ns, tok, hero);
      var cur = null, threw = false;
      for (var q = 0; q < ctxs.length; q++){
        var r;
        try { r = f.score(c.say, ctxs[q][0], ctxs[q][1], all, profs, false); } catch(e){ threw = true; break; }
        var sc = (r && r.sc) || r || {};
        var v = 0, has = false;
        if (Object.prototype.hasOwnProperty.call(sc, who)){ v = sc[who] || 0; has = true; }
        if (canon && canon !== who && Object.prototype.hasOwnProperty.call(sc, canon)){ v = has ? Math.max(v, sc[canon] || 0) : (sc[canon] || 0); has = true; }
        if (!has) v = 0;
        cur = (cur === null) ? v : Math.max(cur, v);
      }
      if (threw){ it.reason = R.THREW; continue; }
      if (cur === null) cur = 0;
      it.cur = cur;
      if (cur > 0){ it.reason = R.POSITIVE_EVIDENCE; continue; }
      it.action = 'ABSTAIN';
      it.reason = (cur < 0 ? R.NEGATIVE_EVIDENCE : R.NO_EVIDENCE) + '/' + originOf(who, hero, castSet);
    }
    return { ok: true, items: items, metaPersisted: !!m.persisted };
  }

  /* ---------- 適用（who の値だけ・'???' のみ） ---------- */
  function applyPlan(turn, p){
    var n = 0;
    if (!p || !p.ok) return 0;
    var cs = turn._convSays || [];
    for (var k = 0; k < p.items.length; k++){
      var it = p.items[k];
      if (it.action !== 'ABSTAIN') continue;
      var c = cs[it.idx];
      if (!c || String(c.who) !== it.who) continue;      // 途中で変わっていたら触らない
      c.who = UNKNOWN;
      n++;
    }
    return n;
  }

  function saveVia(S, why){
    try { if (S && S.save){ (typeof S.saveC === 'function' ? S.saveC(why) : S.save()); stats.saves++; return true; } } catch(e){ stats.errors++; }
    return false;
  }
  function fix616WillSave(){
    var f = window.__v292Dfix616;
    if (!f || typeof f.attach !== 'function') return false;
    return ls('v292Dfix616Off') !== '1';           // fix616 の off() と同じ判定（stats() は selfTest を走らせるので呼ばない）
  }

  /* ---------- 配線: 新ターン確定時（UI.appendTurn）に 1 回・描画前 ---------- */
  function onAppend(turn){
    stats.turnsSeen++;
    if (!on()){ bump(stats.keepAll, R.OFF); return; }
    var S = getS();
    var p = plan(turn, S, {});
    stats.turnsPlanned++;
    stats.last = { turn: S && S.turns ? S.turns.length : null, ok: p.ok, reason: p.reason || null,
                   items: p.items.map(function(x){ return { idx: x.idx, sk: x.sourceKind, action: x.action, reason: x.reason, cur: x.cur }; }) };
    if (!p.ok){ bump(stats.keepAll, p.reason); return; }
    p.items.forEach(function(x){ stats.cardsSeen++; if (x.action === 'ABSTAIN') bump(stats.abstain, x.reason); else bump(stats.keep, x.reason); });
    var n = applyPlan(turn, p);
    if (!n) return;
    stats.abstained += n;
    /* 保存: meta が未付与＝fix616 がこの後 attach → requestSave する（本 fix の変更も同じ save に載る）。
       meta が既に付いている（fix616 が先に走った／fix616 OFF）時だけ自分で 1 回保存する。 */
    if (!p.metaPersisted && fix616WillSave()) stats.reliedOnFix616Save++;
    else saveVia(S, 'fix805.onAppend');
    try { console.log(TAG, 'abstained', n, JSON.stringify(stats.last.items.filter(function(x){ return x.action === 'ABSTAIN'; }))); } catch(e){}
  }
  function install(){
    var UI = getUI();
    if (!UI) return false;
    if (UI.__v292Dfix805) return true;
    try {
      if (typeof UI.appendTurn === 'function'){
        var oa = UI.appendTurn.bind(UI);
        UI.appendTurn = function(turn, idx){
          try { onAppend(turn); } catch(e){ stats.errors++; }
          return oa(turn, idx);
        };
      }
    } catch(e){ stats.errors++; }
    UI.__v292Dfix805 = true;
    try { console.log(TAG, 'wired (new turns only; default OFF, on=' + (on() ? '1' : '0') + ')'); } catch(e){}
    return true;
  }
  (function w(){ w._n = (w._n || 0) + 1; if (install()) return; if (w._n > 120) return; setTimeout(w, 500); })();

  /* ---------- 読み出し（READ-ONLY） ---------- */
  function dryRun(turnIndex){
    var S = getS(); if (!S || !Array.isArray(S.turns)) return null;
    var ti = (turnIndex == null) ? S.turns.length - 1 : turnIndex;
    var t = S.turns[ti]; if (!t) return null;
    var p = plan(t, S, { allowAnyTurn: true });
    return { turn: ti + 1, ok: p.ok, reason: p.reason || null, metaPersisted: !!p.metaPersisted,
             items: p.items.map(function(x){ return { idx: x.idx, who: x.who, sk: x.sourceKind, action: x.action, reason: x.reason, cur: x.cur }; }) };
  }
  function selfTest(){
    /* 純関数 plan() の最小生存証明（S は合成・書込 0）。fix469/616/680 が無い環境では NO_469 等の fail-closed を確認する。 */
    var fake = { cast: { hero: { name: '主人公A' }, npcs: [{ name: '相手B' }] }, turns: [] };
    var t = { narrative: '「テスト」', _convSays: [{ who: '主人公A', say: '「テスト」' }], _convSayMeta: [{ sourceKind: 'say-tag' }] };
    fake.turns.push(t);
    var p = plan(t, fake, { allowAnyTurn: true });
    var okKeep = !p.ok || (p.items.length === 1 && p.items[0].action === 'KEEP');
    return { ok: okKeep, reason: p.reason || (p.items[0] && p.items[0].reason) };
  }
  window.__v292Dfix805 = {
    __v: 1, gate: GATE, reasons: R,
    plan: function(turn, S, opts){ return plan(turn, S || getS(), opts || { allowAnyTurn: true }); },
    dryRun: dryRun,
    stats: function(){ return JSON.parse(JSON.stringify(stats)); },
    state: function(){ return { on: on(), off: off() }; },
    selfTest: selfTest
  };
  try { console.log(TAG, 'loaded (default OFF; on=' + (on() ? '1' : '0') + ')'); } catch(e){}
})();
