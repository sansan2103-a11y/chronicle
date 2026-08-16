// =====================================================================
// Chronicle TRPG - v292Dfix680: 裸引用/harvest だけを既存fix469で正しく評価させる
// ---------------------------------------------------------------------
// 実測(baseline smsvot5mnbj 30T / 会話カード124枚):
//   say-tag 79 (???0) / react-voice 19 (???0) / say-tag-renamed 1 (???0)
//   bare-inferred 18 (???12) / harvest 7 (???6)   ← ??? 18件はこの2経路だけ
//
// 真因(実機で確定・推測ではない):
//   (1) fix462 は fix469 armed 時に無条件 cede する → 配信buildでは不活性
//       実測: __v292Dfix462x.repair() -> {changed:false, ceded:true}
//   (2) fix469 の候補名は names(S)= S.cast.hero.name + S.cast.npcs のみ。
//       この物語は cast.hero.name='' / npcs=[] なので names()=[] となり、
//       __v292Dfix469.dryRun() は null、repair() は {changed:false}。
//       ★話者修復層そのものが 30 ターン一度も動いていなかった(無言の失敗)。
//       登場人物は fix277 quasi 台帳(7件)にだけ存在していた。
//   (3) 地の文は主人公を「あなた」と書くのに、主人公は候補名に一度も入らない。
//       実測 T24: sc={榊原ミナ:-35} hard=[] → 呼びかけ減点は効いていたのに
//       昇格させる相手が居ないので誤りが訂正できなかった。
//       'あなた' を候補に入れると sc={あなた:115, 榊原ミナ:-35} hard=[あなた]。
//
// 本fixがやること(新しい話者推論器は一切作らない):
//   A. 候補名を S.cast ∪ fix277 quasi 台帳 ∪ 主人公表層形('あなた'/'主人公') にする
//   B. 変更を **bare-inferred / harvest のカードだけ** に限定する(fix606のsourceKind)
//   C. fix469 の score / 否定証拠(呼びかけ-35) / HARD / FLIP_MARGIN / 棄権はそのまま使う
//   D. 確定した主人公は正準ラベルへ正規化する(あなた→ hero.name || '主人公')
//
// ★TAG_BONUS の provenance 重み付けは実測で効果0(60/30/20/10/0 で結果同一)のため不採用。
//
// 決定論リプレイ(baseline 124枚):
//   適用4件 = wrong→correct 2(T24) / unknown→correct 2(T4,T21)
//   correct→wrong 0 / unknown→wrong 0 / tagged 変更 0
//   ゲート無しなら T18 小泉麗子→あなた という correct→wrong が出る = ゲートは必須
//
// 既定ON(owner裁定 2026-08-16: DEFAULT ON で出荷)。
// kill switch: localStorage v292Dfix680Off='1' で即無効化(既存fixの慣例どおり)。
// v292Dfix680On='1' は旧preview用。既定ONになったため必須ではない(後方互換で残す)。
// 検証口: window.__v292Dfix680 = { dryRun, apply, names, gate, __armed }
// =====================================================================
(function(){
  'use strict';
  if (window.__f680done) return; window.__f680done = 1;
  var TAG = '[v292Dfix680:bare-provenance]';
  var GATE = { 'bare-inferred': 1, 'harvest': 1 };

  function ls(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return ls('v292Dfix680Off') === '1'; }
  function on(){ return ls('v292Dfix680On') === '1'; }   // 旧preview flag(後方互換)
  // ★2026-08-16 owner裁定: 既定ON。無効化は kill switch v292Dfix680Off のみ。
  function armed(){ return !off(); }

  function getS(){
    try { var a = window.__chronicleGetState ? window.__chronicleGetState('fix680') : null; if (a) return a; } catch(e){}
    try { return window.S || null; } catch(e){ return null; }
  }
  function slotId(){
    var v = ls('chr6_active_slot') || '';
    try { v = JSON.parse(v); } catch(e){}
    return String(v || '').replace(/"/g, '');
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
  function heroCanon(S){
    var n = '';
    try { n = (S && S.cast && S.cast.hero && S.cast.hero.name) ? String(S.cast.hero.name).trim() : ''; } catch(e){}
    return n || '主人公';
  }
  // 候補名: 主人公表層形 + 登録cast + quasi台帳。重複と空を除く。
  function names(S){
    var out = ['あなた', '主人公'], seen = { 'あなた': 1, '主人公': 1 };
    function add(n){ n = String(n || '').trim(); if (!n || seen[n]) return; seen[n] = 1; out.push(n); }
    try {
      if (S && S.cast){
        if (S.cast.hero && S.cast.hero.name) add(S.cast.hero.name);
        (S.cast.npcs || []).forEach(function(x){ if (x && x.name) add(x.name); });
      }
    } catch(e){}
    quasiNames().forEach(add);
    return out;
  }
  var HERO_SURFACE = { 'あなた': 1, '主人公': 1 };

  // ---------- 計画(副作用なし) ----------
  function plan(){
    var S = getS(), f = window.__v292Dfix469;
    if (!S || !Array.isArray(S.turns) || !f || !f.__armed) return null;
    var ns = names(S);
    if (ns.length < 3) return null;                       // 主人公2形 + 実在1名は最低必要
    var tok = f.tokensOf(ns), profs = f.profiles(S), hero = heroCanon(S);
    var applied = [], blocked = [];
    for (var i = 0; i < S.turns.length; i++){
      var t = S.turns[i];
      var mm = (t && t._convSayMeta) || [];
      var copy = { narrative: (t && t.narrative) || '', playerText: (t && t.playerText) || '',
                   _convSays: ((t && t._convSays) || []).map(function(x){ return x ? { who: x.who, say: x.say, _rv: x._rv } : x; }) };
      var before = copy._convSays.map(function(x){ return x && x.who; });
      try { f.planTurn(copy, ns, tok, profs, false); } catch(e){ continue; }
      for (var j = 0; j < copy._convSays.length; j++){
        var c = copy._convSays[j];
        if (!c || c.who === before[j]) continue;
        var sk = (mm[j] && mm[j].sourceKind) || 'none';
        var to = HERO_SURFACE[c.who] ? hero : c.who;      // D: 主人公表層形を正準ラベルへ
        if (to === before[j]) continue;
        var rec = { turn: i + 1, idx: j, sourceKind: sk, from: before[j], to: to, say: String(c.say || '').slice(0, 14) };
        if (GATE[sk]) applied.push(rec); else blocked.push(rec);
      }
    }
    return { names: ns.length, hero: hero, applied: applied, blocked: blocked };
  }

  // ---------- 適用 ----------
  function apply(force){
    if (!force && !armed()) return { skipped: true, armed: armed() };
    var p = plan();
    if (!p || !p.applied.length) return { changed: false, plan: p };
    var S = getS();
    try { localStorage.setItem('chr6_bk_fix680', localStorage.getItem('chr6') || ''); } catch(e){}
    p.applied.forEach(function(r){
      try {
        var c = S.turns[r.turn - 1]._convSays[r.idx];
        if (c && c.who === r.from) c.who = r.to;
      } catch(e){}
    });
    try { if (S.save && !document.hidden) S.save(); } catch(e){}
    try {
      var cards = document.querySelectorAll('.v292-dlg-card');
      for (var i = 0; i < cards.length; i++) if (cards[i].parentNode) cards[i].parentNode.removeChild(cards[i]);
      if (window.__v292Dfix66 && window.__v292Dfix66.repair) window.__v292Dfix66.repair();
    } catch(e){}
    try { console.log(TAG, 'applied', JSON.stringify(p.applied)); } catch(e){}
    return { changed: true, applied: p.applied.length, blocked: p.blocked.length };
  }


  // ---------- E: 矛盾した現speakerの降格(wrong -> unknown) ----------
  // 実測T31: 「……ミナさん、もう一度タオルを」が榊原ミナ本人の発言として付いていた。
  //   sc={榊原ミナ:-35}(呼びかけ減点は正しく効いている) / 正の候補は0件
  //   → 昇格先が無いので flip できないが、現speakerは証拠に矛盾している。
  //   この形だけ '???' へ降格する。誤帰属より不明を優先する方針そのもの。
  //   baseline 30T + T31 の全カードで該当は T31 の1件のみ(誤爆0)。
  function normQ(s){ return String(s || '').replace(/[\s\u3000。、，．！？!?…‥・「」『』]/g, ''); }
  function planDemote(){
    var S = getS(), f = window.__v292Dfix469;
    if (!S || !Array.isArray(S.turns) || !f || !f.__armed) return [];
    var ns = names(S); if (ns.length < 3) return [];
    var tok = f.tokensOf(ns), profs = f.profiles(S), out = [];
    for (var ti = 0; ti < S.turns.length; ti++){
      var t = S.turns[ti], L = String(t.narrative || '').split('\n'), mm = t._convSayMeta || [];
      var all = tok.concat(f.extraTokens({ narrative: t.narrative, _convSays: t._convSays }, ns, t.narrative));
      var cs = t._convSays || [];
      for (var j = 0; j < cs.length; j++){
        var c = cs[j];
        if (!c || !c.say || c._rv === 1) continue;
        var sk = (mm[j] && mm[j].sourceKind) || '';
        if (!GATE[sk]) continue;
        if (String(c.who || '') === '???') continue;
        var n = normQ(c.say), at = -1;
        for (var i = 0; i < L.length; i++){ var l = normQ(L[i]); if (l && (l === n || l.indexOf(n) >= 0)){ at = i; break; } }
        if (at < 0) continue;
        var r = f.score(c.say, at > 0 ? L[at - 1] : '', at + 1 < L.length ? L[at + 1] : '', all, profs, false);
        var sc = r.sc || r, cur = sc[c.who] || 0, pos = 0;
        Object.keys(sc).forEach(function(k){ if (k !== c.who && sc[k] > 0) pos++; });
        if (cur < 0 && pos === 0)
          out.push({ turn: ti + 1, idx: j, sourceKind: sk, from: c.who, to: '???', score: cur, say: String(c.say).slice(0, 14) });
      }
    }
    return out;
  }
  function applyDemote(force){
    if (!force && !armed()) return { skipped: true };
    var S = getS(), p = planDemote();
    if (!p.length) return { changed: false, n: 0 };
    p.forEach(function(r){ try { var c = S.turns[r.turn - 1]._convSays[r.idx]; if (c && c.who === r.from) c.who = '???'; } catch(e){} });
    try { if (S.save && !document.hidden) S.save(); } catch(e){}
    try {
      var cd = document.querySelectorAll('.v292-dlg-card');
      for (var i = 0; i < cd.length; i++) if (cd[i].parentNode) cd[i].parentNode.removeChild(cd[i]);
      if (window.__v292Dfix66 && window.__v292Dfix66.repair) window.__v292Dfix66.repair();
    } catch(e){}
    try { console.log(TAG, 'demoted', JSON.stringify(p)); } catch(e){}
    return { changed: true, n: p.length, list: p };
  }

  // ---------- ターン追従 ----------
  var lastSig = '';
  function sig(){
    var S = getS(); if (!S || !Array.isArray(S.turns)) return '';
    var last = S.turns[S.turns.length - 1];
    return S.turns.length + ':' + ((last && last._convSays && last._convSays.length) || 0);
  }
  function tick(){
    try {
      if (!armed()) return;
      var s = sig(); if (!s || s === lastSig) return;
      lastSig = s; apply(); applyDemote();
    } catch(e){}
  }
  try { setTimeout(tick, 5000); setInterval(tick, 2500); } catch(e){}

  window.__v292Dfix680 = { __armed: true, gate: GATE, names: names, dryRun: plan, apply: apply,
                           planDemote: planDemote, applyDemote: applyDemote,
                           state: function(){ return { on: on(), off: off(), armed: armed() }; } };
  try { console.log(TAG, 'loaded (default-on; armed=' + (armed() ? '1' : '0') + ')'); } catch(e){}
})();
