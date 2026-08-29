// =====================================================================
// Chronicle TRPG - v292Dfix681: PLAYER SAY の発話を主人公へ帰属させる
//
// ■何を直すのか（2026-08-16・実測）
//   index.html の fix193 は「プレイヤーの SAY 入力と同一内容のカードは主人公のもの」
//   という **正しい** 判断を持っているが、ブロック全体が
//     if (... && S.cast && S.cast.hero && S.cast.hero.name){ ... }
//   で gate されている。無名主人公（hero.name=''）では丸ごと no-op になり、
//   プレイヤー自身の台詞が who='???' のまま会話ログに残る。
//   実測 T36「宮下先生、戸倉さん、ミナさん。…」= player SAY 入力そのものが ??? だった。
//
// ■なぜ推論ではないのか
//   これは speaker inference ではなく **input provenance**。
//   PLAYER SAY = PROTAGONIST SPEECH は確定事項で、近接・行動連続性などの
//   弱い証拠とは種類が違う。よって rung2 の計測を待たずに直してよい（GPT裁定）。
//
// ■やること（これだけ）
//   inputType==='SAY' のターンで、playerText と**正規化後に完全一致**するカードの
//   who を正準主人公ラベルへ書き換える。それ以外は1バイトも触らない。
//
// ■やらないこと（禁止事項の明示）
//   ・S.cast.hero.name へ '主人公' を書かない（consumer 側でラベルを合成するだけ）
//   ・index.html の _heroNm へ global fallback を入れない
//   ・rung2（_list218.length===0 → _heroNm）に触らない
//   ・部分一致・近接・スコアなど推論を一切使わない（完全一致のみ）
//   ・カードの削除・並べ替えをしない（fix193 の dedup 部分は再現しない＝relabel だけ）
//
// 冪等: window.__v292Dfix681
// kill switch: localStorage v292Dfix681Off='1'
// 検証口: window.__v292Dfix681 = { dryRun, apply, state, __armed }
// =====================================================================
(function(){
  'use strict';
  if (window.__f681done) return; window.__f681done = 1;
  var TAG = '[v292Dfix681:player-say-claim]';

  function ls(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return ls('v292Dfix681Off') === '1'; }
  function armed(){ return !off(); }

  function getS(){
    try { var a = window.__chronicleGetState ? window.__chronicleGetState('fix681') : null; if (a) return a; } catch(e){}
    try { return window.S || null; } catch(e){ return null; }
  }
  /* 正準主人公ラベル。S.cast へは書かない。fix680 heroCanon と同一規則。 */
  function heroCanon(S){
    var n = '';
    try { n = (S && S.cast && S.cast.hero && S.cast.hero.name) ? String(S.cast.hero.name).trim() : ''; } catch(e){}
    return n || '主人公';
  }
  function norm(s){ return String(s || '').replace(/[\s　。、，．！？!?…‥・「」『』]/g, ''); }

  /* ★★fix732(RULING85 §1-§10) — NORMAL_LOAD_HISTORICAL_MUTATION_CONTAINMENT
     自動経路（タイマ / render フック / appendTurn）は
     **このセッション中に生成されたターンだけ**を対象にする。
     判定は turns.length の差分ではなく、唯一の新ターン生成口
     （index.html の S.turns.push(turn)）で登録された provenance を使う。
     → hydration 0→1 / 逐次 hydration / restore 後の regrow を新ターンと誤認しない。
     → 全 module が同一 registry を見るので module 間で baseline がズレない。
     scope module が居ない場合は false ＝ 何も自動処理しない fail-closed。
     heuristics: 変更 0 / explicit API: 全ターン対象のまま保持 / new-turn logic: 保持。 */
  function _f732New(t){
    try { var W = window.__v292Dfix732Scope; return !!(W && typeof W.isNew === 'function' && W.isNew(t)); }
    catch(e){ return false; }
  }

  function plan(){
    var S = getS();
    if (!S || !Array.isArray(S.turns)) return null;
    var hero = heroCanon(S), out = [];
    for (var i = 0; i < S.turns.length; i++){
      var t = S.turns[i];
      if (!t || String(t.inputType || '') !== 'SAY') continue;     /* SAY ターン限定 */
      var pt = norm(t.playerText); if (!pt || pt.length < 2) continue;
      var cs = t._convSays || [], mm = t._convSayMeta || [];
      for (var j = 0; j < cs.length; j++){
        var c = cs[j];
        if (!c || !c.say) continue;
        if (norm(c.say) !== pt) continue;                          /* 完全一致のみ */
        if (String(c.who || '') === hero) continue;                /* 既に正しい */
        out.push({ turn: i + 1, idx: j, from: (c.who == null ? '(null)' : String(c.who)), to: hero,
                   sourceKind: (mm[j] && mm[j].sourceKind) || 'none',
                   say: String(c.say).slice(0, 16) });
      }
    }
    return { hero: hero, applied: out };
  }

  function apply(force, _auto){
    if (!force && !armed()) return { skipped: true, armed: armed() };
    /* ★2026-08-16 実測: 生成中(S.inFlight)に書くと、生成完了時の保存に
       古いスナップショットで上書きされ修正が消える。実際に1回発生した。 */
    try { var _s0 = getS(); if (_s0 && _s0.inFlight) return { skipped: true, inFlight: true }; } catch(e){}
    var p = plan();
    if (!p || !p.applied.length) return { changed: false, plan: p };
    var S = getS();
    /* ★★fix732(RULING85): 自動経路は session-new turn のみ。
       explicit（__v292Dfix681.apply(true) / apply(true)）は従来どおり全ターン対象。 */
    if (_auto){
      var _keep = p.applied.filter(function(r){
        try { return _f732New(S.turns[r.turn - 1]); } catch(e){ return false; }
      });
      if (!_keep.length) return { changed: false, historicalSkipped: p.applied.length };
      p = { hero: p.hero, applied: _keep };
    }
    try { localStorage.setItem('chr6_bk_fix681', localStorage.getItem('chr6') || ''); } catch(e){}
    p.applied.forEach(function(r){
      try { var c = S.turns[r.turn - 1]._convSays[r.idx]; if (c) c.who = r.to; } catch(e){}
    });
    /* ★2026-08-16 GPT裁定 DOCUMENT_HIDDEN_SAVE_SKIP_CONFIRMED: document.hidden を
       save 可否の条件に使わない。生成競合の防御は S.inFlight だけが担う。 */
    try { if (S.save) (typeof S.saveC==='function'?S.saveC('fix681.apply'):S.save()); } catch(e){}
    try {
      var cards = document.querySelectorAll('.v292-dlg-card');
      for (var i = 0; i < cards.length; i++) if (cards[i].parentNode) cards[i].parentNode.removeChild(cards[i]);
      if (window.__v292Dfix66 && window.__v292Dfix66.repair) window.__v292Dfix66.repair();
    } catch(e){}
    try { console.log(TAG, 'applied', JSON.stringify(p.applied)); } catch(e){}
    return { changed: true, applied: p.applied.length };
  }

  var lastSig = '';
  function sig(){
    var S = getS(); if (!S || !Array.isArray(S.turns)) return '';
    var last = S.turns[S.turns.length - 1];
    return S.turns.length + ':' + ((last && last._convSays && last._convSays.length) || 0);
  }
  function tick(){
    try {
      if (!armed()) return;
      var S0 = getS(); if (!S0 || S0.inFlight) return;      /* 生成中は触らない */
      var s = sig(); if (!s || s === lastSig) return;
      lastSig = s; apply(false, true);        /* ★fix732: 自動経路 */
    } catch(e){}
  }
  try { setTimeout(tick, 5000); setInterval(tick, 2500); } catch(e){}

  window.__v292Dfix681 = { __armed: true, dryRun: plan, apply: apply,
                           state: function(){ return { off: off(), armed: armed() }; } };
  try { console.log(TAG, 'loaded (default-on; armed=' + (armed() ? '1' : '0') + ')'); } catch(e){}
})();
