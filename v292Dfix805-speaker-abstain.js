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
/* ★v2（4B1C_EPHEMERAL_NONCAST_SPEAKER_RESOLUTION v1・GPT 裁定 2026-09-05 REVISE→GO）:
 *   「前 turn の high-provenance に居た cast 外話者（例: 男）を次 turn の裸台詞で忘れ、cast 名へ誤帰属する」穴だけを塞ぐ。
 *   (1) ephPrev = 直前 1 turn（K=1・PREVIOUS ONE TURN ONLY）の say-tag/react-voice に現れた cast 外 who を derived（保存しない）で
 *       fix469 score の採点 token に足す。1 字ラベルは境界 regex `(^|[^一-鿿])X(の|が|は)` が ctx 行に一致する時だけ。
 *   (2) COMPETING_HARD: 現 who の正証拠が弱い（0 < cur < 90）のに ephPrev の話者に HARD 証拠（≥90・「男の声が」型）があれば '???' へ。
 *       振替はしない（resolver ではない）。競合者は cast ではなく **ephemeral non-cast のみ**（cast-vs-cast は v1 対象外・E05 diagnostic）。
 *   (3) ephSelf = 当 turn の high-prov 1 字ラベルは same-who の self evidence にだけ使う（fix238 が選んだ 男 を NOT_IN_CAST で落とさない）。
 *   (4) EPHEMERAL_OBSERVED は採点上の来歴ラベルだけ（entity／NPC 状態にしない）。Entity Identity／fix277／fix640／fix641／Memory へ write 0。
 *   kill: v292Dfix805EphOff='1' で v1 挙動へ完全復帰。805 本体は既定 OFF のまま。 */
(function(){
  'use strict';
  if (window.__v292Dfix805) return;
  var TAG = '[v292Dfix805:speaker-abstain]';
  var GATE = { 'bare-inferred': 1, 'harvest': 1 };
  var UNKNOWN = '???';
  /* label 専用（判定には使わない）。index.html _LANGS217.ja.entityNouns の写し。 */
  var ENTITY_NOUNS = { '妖怪':1,'怪異':1,'化け物':1,'怪物':1,'魔物':1,'悪霊':1,'亡霊':1,'幽霊':1,'人形':1 };
  var HERO_SURFACE = { 'あなた': 1, '主人公': 1 };
  /* ★v2: fix469 と同じ定数（露出していないため同値を置く・fixture で PTS と突き合わせる） */
  var HARD = 90;
  var EPH_K = 1;                                            // PREVIOUS ONE TURN ONLY（GPT Q3）
  var EPH_SRC = { 'say-tag': 1, 'react-voice': 1 };
  var PRONOUN_WHO = { '私':1,'俺':1,'僕':1,'彼':1,'彼女':1,'あなた':1,'お前':1,'君':1,'誰か':1,'自分':1 };   // fix495 B1 と同一

  var R = {
    // KEEP_ALL（turn 単位・fail-closed）
    OFF: 'OFF', NOT_LAST_TURN: 'NOT_LAST_TURN', NOT_SESSION_NEW: 'NOT_SESSION_NEW', NO_CARDS: 'NO_CARDS',
    META_UNAVAILABLE: 'META_UNAVAILABLE', META_MISALIGNED: 'META_MISALIGNED', NO_469: 'NO_469', NAMES_LT3: 'NAMES_LT3', THREW: 'THREW',
    // KEEP（card 単位）
    HIGH_PROVENANCE: 'HIGH_PROVENANCE', REACT_VOICE: 'REACT_VOICE', ALREADY_UNKNOWN: 'ALREADY_UNKNOWN',
    PLAYER_SAY: 'PLAYER_SAY', LINE_NOT_FOUND: 'LINE_NOT_FOUND', POSITIVE_EVIDENCE: 'POSITIVE_EVIDENCE',
    // ★v2 ABSTAIN（card 単位・prefix）
    COMPETING_HARD: 'COMPETING_HARD',
    // ★v2 origin（label）
    EPHEMERAL_OBSERVED: 'EPHEMERAL_OBSERVED',
    // ABSTAIN（card 単位・prefix）
    NO_EVIDENCE: 'NO_EVIDENCE', NEGATIVE_EVIDENCE: 'NEGATIVE_EVIDENCE',
    // origin（label）
    HERO_DEFAULT: 'HERO_DEFAULT', ENTITY_NOUN_ONLY: 'ENTITY_NOUN_ONLY', NOT_IN_CAST: 'NOT_IN_CAST', SINGLE_CANDIDATE_OR_UNKNOWN: 'SINGLE_CANDIDATE_OR_UNKNOWN'
  };

  var stats = { turnsSeen: 0, turnsPlanned: 0, keepAll: {}, keep: {}, abstain: {}, abstained: 0, cardsSeen: 0,
                saves: 0, reliedOnFix616Save: 0, errors: 0, last: null,
                competing: { checked: 0, abstained: 0, ephPrevTurns: 0, ephPrevNames: 0, selfEvidence: 0 } };   // ★v2 in-memory only
  function bump(map, k){ map[k] = (map[k] || 0) + 1; }

  function ls(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return ls('v292Dfix805Off') === '1'; }
  function on(){ return ls('v292Dfix805On') === '1' && !off(); }
  function ephOn(){ return ls('v292Dfix805EphOff') !== '1'; }   // ★v2 kill（既定 ON・805 本体が ON の端末でだけ意味を持つ）

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
  function originOf(who, hero, castSet, ephSet){
    var w = nospace(who);
    if (hero && (w === nospace(hero) || HERO_SURFACE[w])) return R.HERO_DEFAULT;
    if (ENTITY_NOUNS[w] && !castSet[w]) return R.ENTITY_NOUN_ONLY;
    if (ephSet && ephSet[w] && !castSet[w]) return R.EPHEMERAL_OBSERVED;   // ★v2 label のみ
    if (!castSet[w]) return R.NOT_IN_CAST;
    return R.SINGLE_CANDIDATE_OR_UNKNOWN;
  }
  /* ★v2: ある turn の high-provenance card から cast 外 who を集める（derived・保存しない・fail-closed）。
     meta は永続 _convSayMeta を優先し、無ければ fix606.classifyCard（純関数）で補い、それも無理なら空。 */
  function ephFromTurn(t, hero, knownSet){
    var out = {};
    if (!t || !Array.isArray(t._convSays)) return out;
    var cs = t._convSays, mm = Array.isArray(t._convSayMeta) && t._convSayMeta.length === cs.length ? t._convSayMeta : null;
    if (!mm){
      /* 永続 meta が無い turn は fix616 と同じ純関数 buildMeta で同じ分類を得る（metaFor と同規則）。取れなければこの turn は候補源から除外（fail-closed） */
      var f616 = window.__v292Dfix616;
      if (f616 && typeof f616.buildMeta === 'function'){
        try { var r6 = f616.buildMeta(t, hero); if (r6 && r6.ok && Array.isArray(r6.meta) && r6.meta.length === cs.length) mm = r6.meta; } catch(e){ mm = null; }
      }
      if (!mm) return out;
    }
    for (var j = 0; j < cs.length; j++){
      var c = cs[j]; if (!c || c.who == null) continue;
      var sk = mm[j] ? mm[j].sourceKind : null;
      if (!sk && c._rv === 1) sk = 'react-voice';
      if (!sk || !EPH_SRC[sk]) continue;
      var w = String(c.who).trim(), k = nospace(w);
      if (!k || k === UNKNOWN || k.length > 12 || PRONOUN_WHO[k] || HERO_SURFACE[k]) continue;
      if (knownSet[k]) continue;
      var collide = false;
      for (var n2 in knownSet){ if (n2.indexOf(k) >= 0 || k.indexOf(n2) >= 0){ collide = true; break; } }   // extraTokens L171 と同じ衝突規則
      if (collide) continue;
      out[k] = w;
    }
    return out;
  }
  /* 1 字ラベルの境界ガード: 直前が漢字でなく、直後が の/が/は。辞書ではなく規則 1 本（付録 B）。 */
  function oneCharHit(tok, line){
    if (!line) return false;
    var re = new RegExp('(^|[^一-鿿])' + tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(の|が|は)');
    return re.test(String(line));
  }
  function ephTokensForCtx(ephMap, prevLine, nextLine){
    var add = [];
    for (var k in ephMap){
      var w = ephMap[k];
      if (k.length >= 2) add.push({ canon: w, tok: w });
      else if (oneCharHit(k, prevLine) || oneCharHit(k, nextLine)) add.push({ canon: w, tok: w });
    }
    return add;
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
    /* ★v2: ephemeral non-cast（derived・保存 0）。ephPrev = 直前 K turn の高 prov who（競合候補）／ephSelf = 当 turn の高 prov who（self evidence のみ） */
    var knownSet = {}; ns.forEach(function(n){ knownSet[nospace(n)] = 1; }); for (var ck in castSet) knownSet[ck] = 1;
    var ephPrev = {}, ephSelf = {}, ephAll = {};
    if (ephOn()){
      try {
        var ti = S.turns.indexOf(turn);
        if (ti > 0){
          for (var pi = Math.max(0, ti - EPH_K); pi < ti; pi++){
            var em = ephFromTurn(S.turns[pi], hero, knownSet);
            for (var ek in em){ ephPrev[ek] = em[ek]; }
            stats.competing.ephPrevTurns++;
          }
        }
        ephSelf = ephFromTurn(turn, hero, knownSet);
        for (var k1 in ephPrev){ ephAll[k1] = ephPrev[k1]; }
        for (var k2 in ephSelf){ ephAll[k2] = ephSelf[k2]; }
        stats.competing.ephPrevNames += Object.keys(ephPrev).length;
      } catch(e){ ephPrev = {}; ephSelf = {}; ephAll = {}; }
    }
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
      /* ★v2: 採点 token = 既存 all ＋ ephPrev（競合候補）＋ ephSelf のうち who 自身（self evidence）。1 字は境界ガード付き。 */
      var whoKey = nospace(who);
      var ephForCard = {};
      for (var pk in ephPrev) ephForCard[pk] = ephPrev[pk];
      if (ephSelf[whoKey]){ ephForCard[whoKey] = ephSelf[whoKey]; stats.competing.selfEvidence++; }
      var hardMax = 0, hardWho = null;
      for (var q = 0; q < ctxs.length; q++){
        var r;
        var toks = all;
        try {
          var addT = ephTokensForCtx(ephForCard, ctxs[q][0], ctxs[q][1]);
          if (addT.length) toks = all.concat(addT);
        } catch(e){ toks = all; }
        try { r = f.score(c.say, ctxs[q][0], ctxs[q][1], toks, profs, false); } catch(e){ threw = true; break; }
        var sc = (r && r.sc) || r || {};
        var v = 0, has = false;
        if (Object.prototype.hasOwnProperty.call(sc, who)){ v = sc[who] || 0; has = true; }
        if (canon && canon !== who && Object.prototype.hasOwnProperty.call(sc, canon)){ v = has ? Math.max(v, sc[canon] || 0) : (sc[canon] || 0); has = true; }
        if (!has) v = 0;
        cur = (cur === null) ? v : Math.max(cur, v);
        /* ★v2 競合 HARD（ephPrev の non-cast のみ・cast は対象外 = GPT Q1） */
        var hd = (r && r.hard) || {};
        for (var hk in hd){
          if (hk === who || (canon && hk === canon)) continue;
          if (!ephPrev[nospace(hk)]) continue;
          if (hd[hk] >= HARD && hd[hk] > hardMax){ hardMax = hd[hk]; hardWho = hk; }
        }
      }
      if (threw){ it.reason = R.THREW; continue; }
      if (cur === null) cur = 0;
      it.cur = cur;
      if (cur > 0){
        if (hardWho){ stats.competing.checked++; }
        if (hardWho && cur < HARD){
          it.action = 'ABSTAIN';
          it.reason = R.COMPETING_HARD + '/' + originOf(who, hero, castSet, ephAll);
          it.competitor = hardWho; it.competitorHard = hardMax;
          stats.competing.abstained++;
          continue;
        }
        it.reason = R.POSITIVE_EVIDENCE; continue;
      }
      it.action = 'ABSTAIN';
      it.reason = (cur < 0 ? R.NEGATIVE_EVIDENCE : R.NO_EVIDENCE) + '/' + originOf(who, hero, castSet, ephAll);
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
                   items: p.items.map(function(x){ return { idx: x.idx, sk: x.sourceKind, action: x.action, reason: x.reason, cur: x.cur, competitor: x.competitor || null, competitorHard: x.competitorHard || 0 }; }) };
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
             items: p.items.map(function(x){ return { idx: x.idx, who: x.who, sk: x.sourceKind, action: x.action, reason: x.reason, cur: x.cur, competitor: x.competitor || null, competitorHard: x.competitorHard || 0 }; }) };
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
    __v: 2, gate: GATE, reasons: R, HARD: HARD, EPH_K: EPH_K,
    plan: function(turn, S, opts){ return plan(turn, S || getS(), opts || { allowAnyTurn: true }); },
    dryRun: dryRun,
    stats: function(){ return JSON.parse(JSON.stringify(stats)); },
    state: function(){ return { on: on(), off: off(), eph: ephOn() }; },
    __test: { ephFromTurn: ephFromTurn, oneCharHit: oneCharHit, ephTokensForCtx: ephTokensForCtx },
    selfTest: selfTest
  };
  try { console.log(TAG, 'loaded (default OFF; on=' + (on() ? '1' : '0') + ')'); } catch(e){}
})();
