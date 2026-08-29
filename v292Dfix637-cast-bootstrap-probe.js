/* v292Dfix637-cast-bootstrap-probe.js (2026-07-29)
 * ─ 「新しい物語で主人公もNPCも登録されないまま進む」を**無言にしない** ─
 *
 * ■背景（2026-07-29 の監査で静的に確定したこと）
 *   `S.cast.npcs` へ書き込む生きた経路は、実配信ぶんを全列挙すると次の5つしかない。
 *     ① 設定画面の入力（features.js の syncStateFromForm / fix351 の commitDraft）
 *     ② おまかせ（fix335）
 *     ③ キャラ一覧の「NPCとして登録」ボタン（fix145 promoteToNpc）
 *     ④ キャラ生成 wizard（features.js fix42）
 *     ⑤ features.js §8 auto_bootstrap（本文から自動で主人公・NPC・場所を埋める）
 *   このうち **⑤だけが「人が触らなくても埋まる」唯一の経路**で、
 *   その⑤が `if (!window.S) return;` で始まっている。
 *   このページの `S` は index.html の **トップレベル const**（`window.S` は永久に undefined）
 *   なので、⑤は**一度も走っていない**。
 *   ＝設定を通さずに物語を始めると、`cast.hero.name` は空、`cast.npcs` は空のまま進む。
 *   （fix333i / fix336 が既に踏んだ「window.S undefined」と同じ型のバグ。
 *     features.js の §8/§9/§10 と fix50 の getRoster は同じ理由でまだ休眠している。）
 *
 * ■このfixの立場（★既定では1バイトも書かない）
 *   ⑤を黙って復活させると、**本文から推測した名前がセーブデータの主人公名として確定する**。
 *   おしんが意図した主人公と違う名前が入り得るし、あとから気づきにくい。
 *   このプロジェクトで繰り返し正解だった型に従う ＝ **まず観測できるようにする**。
 *     ・空のまま進んでいることを**その場で警告する**（無言にしない）
 *     ・⑤が動いていたら何を書いたかを `proposal()` で**見せるだけ**
 *     ・書き込みは **明示的に許可したときだけ**（`v292Dfix637Apply='1'`）
 *
 * ■読み出し（コンソール）
 *   window.__v292Dfix637.report()     … いまの登録状況と休眠している経路の一覧
 *   window.__v292Dfix637.proposal()   … auto_bootstrap が書くはずだった内容（書かない）
 *   window.__v292Dfix637.apply()      … ★その内容を実際に書く（人が明示的に呼んだときだけ）
 *   window.__v292Dfix637.selfTest()
 *
 * 冪等: window.__v292Dfix637
 * OFF : localStorage v292Dfix637Off='1'
 * 自動適用の許可: localStorage v292Dfix637Apply='1'（既定は無し＝書かない）
 */
(function v292Dfix637(){
  'use strict';
  if (window.__v292Dfix637 && window.__v292Dfix637.__armed) return;
  var TAG = '[v292Dfix637:cast-probe]';

  function lsg(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function off(){ return lsg('v292Dfix637Off') === '1'; }
  function applyAllowed(){ return lsg('v292Dfix637Apply') === '1'; }

  function note539(reason, err){
    try { if (window.__chronicleState && typeof window.__chronicleState.note === 'function')
            window.__chronicleState.note('fix637', reason, err); } catch(e){}
  }
  function getState(){
    var g = null;
    try { g = window.__chronicleGetState; } catch(e){}
    if (typeof g === 'function'){
      try { var a = g('fix637'); if (a) return a; } catch(e){ note539('getter-threw', e); }
    } else { note539('getter-missing'); }
    try { if (window.S){ note539('rescued-by-window'); return window.S; } } catch(e){}
    try { var u = (0,eval)('typeof S!=="undefined"?S:null');
          if (u){ note539('rescued-by-eval'); return u; }
          note539('legacy-eval-null'); }
    catch(e){ note539('legacy-eval-threw', e); }
    return null;
  }

  function isEmpty(s){ return !s || (typeof s === 'string' && s.trim().length === 0); }
  function ab(){ try { return (window.__v292 && window.__v292.autoBootstrap) || null; } catch(e){ return null; } }

  /* ---- 休眠経路の実測（推測で書かない。呼んで結果を見る） ------------------ */
  function deadPaths(){
    var st = getState();
    var castNamed = !!(st && st.cast && ((st.cast.hero && st.cast.hero.name) ||
                       (Array.isArray(st.cast.npcs) && st.cast.npcs.some(function(n){ return n && n.name; }))));
    var turns = (st && Array.isArray(st.turns)) ? st.turns.length : 0;
    var out = [];
    /* features.js §8 auto_bootstrap — turns があるのに extractFromState が null なら死んでいる */
    try {
      var a = ab();
      if (a && typeof a.extractFromState === 'function'){
        var ex = a.extractFromState();
        out.push({ path: 'features.js §8 auto_bootstrap', alive: !(turns > 0 && ex === null),
                   detail: 'extractFromState()=' + (ex === null ? 'null' : 'object') + ' / turns=' + turns });
      } else {
        out.push({ path: 'features.js §8 auto_bootstrap', alive: false, detail: 'API未公開' });
      }
    } catch(e){ out.push({ path: 'features.js §8 auto_bootstrap', alive: false, detail: 'threw' }); }
    /* features.js §9 memory(v219) — 名前付きキャストが居るのに状態ブロックが空なら死んでいる */
    try {
      var m = window.__v292 && window.__v292.memory;
      if (m && typeof m.buildStateBlock === 'function'){
        var b = m.buildStateBlock();
        out.push({ path: 'features.js §9 memory(v219) sys注入', alive: !(castNamed && b === ''),
                   detail: 'buildStateBlock().length=' + String(b || '').length });
      }
    } catch(e){}
    /* features.js §10 state_inference — 既定OFF。OFFなのは仕様なので区別して出す */
    try {
      var si = window.__v292 && window.__v292.stateInference;
      if (si && typeof si.isEnabled === 'function'){
        out.push({ path: 'features.js §10 state_inference', alive: !!si.isEnabled(),
                   detail: si.isEnabled() ? 'ON' : '既定OFF（仕様）' });
      }
    } catch(e){}
    /* features.js fix50 voice signature — キャストが居るのに roster が空なら死んでいる */
    try {
      var f50 = window.Planner && window.Planner.v292Dfix50;
      if (f50 && typeof f50.getRoster === 'function'){
        var r = f50.getRoster();
        out.push({ path: 'features.js fix50 声紋ブロック', alive: !(castNamed && r.length === 0),
                   detail: 'getRoster().length=' + r.length });
      }
    } catch(e){}
    /* fix600 新物語ガード — memTurns()=-1 なら window.S 依存で死んでいる（fix635 が肩代わり） */
    try {
      var g6 = window.__v292Dfix600;
      if (g6 && typeof g6.memTurns === 'function'){
        out.push({ path: 'fix600 新物語ガード', alive: g6.memTurns() !== -1,
                   detail: 'memTurns()=' + g6.memTurns() +
                           ' / fix635=' + (window.__v292Dfix635 ? 'あり' : 'なし') });
      }
    } catch(e){}
    return out;
  }

  /* ---- auto_bootstrap が書くはずだった内容を再現する（純粋関数だけ借りる） ---- */
  function proposal(){
    var out = { ok: false, reason: '', hero: null, npcs: [], scene: { loc: '', obj: '' } };
    var st = getState();
    if (!st || !st.cast){ out.reason = 'no-state'; return out; }
    if (!isEmpty(st.cast.hero && st.cast.hero.name)){ out.reason = 'hero-already-set'; return out; }
    var turns = Array.isArray(st.turns) ? st.turns : [];
    if (!turns.length){ out.reason = 'no-turns'; return out; }
    var a = ab();
    if (!a || typeof a.extractKatakanaNames !== 'function'){ out.reason = 'helpers-missing'; return out; }

    var sources = [];
    turns.forEach(function(t){
      if (t && t.playerText) sources.push(t.playerText);
      if (t && t.narrative)  sources.push(t.narrative);
    });
    var combined = sources.join('\n');
    var primary = sources[0] || '';
    var names = a.extractKatakanaNames(combined) || [];

    var heroName = '';
    for (var i = 0; i < names.length; i++){
      if (primary.indexOf(names[i]) >= 0){ heroName = names[i]; break; }
    }
    if (!heroName) heroName = names[0] || '';
    if (heroName) out.hero = { name: heroName };

    var seen = {};
    names.forEach(function(n){
      if (n === heroName || seen[n]) return;
      seen[n] = true;
      out.npcs.push({ name: n });
    });
    try {
      out.scene.loc = (a.extractSceneLoc && (a.extractSceneLoc(primary) || a.extractSceneLoc(combined))) || '';
      out.scene.obj = (a.extractSceneObj && (a.extractSceneObj(primary) || a.extractSceneObj(combined))) || '';
    } catch(e){}
    out.ok = !!(out.hero || out.npcs.length || out.scene.loc || out.scene.obj);
    if (!out.ok) out.reason = 'nothing-extracted';
    return out;
  }

  /* ---- 書き込みは人が明示的に許可したときだけ ------------------------------ */
  function apply(opts){
    opts = opts || {};
    if (!opts.force && !applyAllowed()){
      try { console.warn(TAG, '書き込みは許可されていません。' +
        "localStorage.setItem('v292Dfix637Apply','1') を入れてから apply() を呼ぶか、apply({force:true}) を使ってください。"); } catch(e){}
      return { written: false, reason: 'not-allowed' };
    }
    var p = proposal();
    if (!p.ok) return { written: false, reason: p.reason || 'nothing' };
    var st = getState();
    if (!st || !st.cast) return { written: false, reason: 'no-state' };
    var changed = [];
    if (p.hero && isEmpty(st.cast.hero && st.cast.hero.name)){
      st.cast.hero = st.cast.hero || {};
      st.cast.hero.name = p.hero.name; changed.push('hero=' + p.hero.name);
    }
    if (p.npcs.length){
      if (!Array.isArray(st.cast.npcs)) st.cast.npcs = [];
      var have = {}; st.cast.npcs.forEach(function(n){ if (n && n.name) have[n.name] = 1; });
      p.npcs.forEach(function(x){
        if (have[x.name]) return;
        st.cast.npcs.push({ name: x.name, desc: '' });
        have[x.name] = 1; changed.push('npc=' + x.name);
      });
    }
    st.scene = st.scene || {};
    if (isEmpty(st.scene.loc) && p.scene.loc){ st.scene.loc = p.scene.loc; changed.push('loc=' + p.scene.loc); }
    if (isEmpty(st.scene.obj) && p.scene.obj){ st.scene.obj = p.scene.obj; changed.push('obj=' + p.scene.obj); }
    if (!changed.length) return { written: false, reason: 'no-change' };
    try { if (typeof st.save === 'function') (typeof st.saveC==='function'?st.saveC('fix637.castBootstrapProbe'):st.save()); } catch(e){}
    try { console.warn(TAG, '書き込みました:', changed.join(' / ')); } catch(e){}
    return { written: true, changed: changed };
  }

  /* ---- 起動後の点検（読み取りのみ・1回だけ警告する） ---------------------- */
  var warned = false;
  var WARN_AFTER_TURNS = 3;
  function check(){
    if (off() || warned) return null;
    var st = getState();
    if (!st || !st.cast) return null;
    var turns = Array.isArray(st.turns) ? st.turns.length : 0;
    if (turns < WARN_AFTER_TURNS) return null;
    var heroEmpty = isEmpty(st.cast.hero && st.cast.hero.name);
    var npcEmpty  = !Array.isArray(st.cast.npcs) || !st.cast.npcs.some(function(n){ return n && n.name; });
    /* ★警告するのは「主人公が空」のときだけ。
       主人公が入っていて NPC が 0 件なのは**正常な形**（名無しの存在は fix277 準登録 /
       fix307 ロスターが持つ設計）。ここで鳴らすとログが常に汚れて、本当の異常が埋もれる。 */
    if (!heroEmpty) return null;
    warned = true;
    var p = proposal();
    try {
      console.warn(TAG, '★' + turns + 'ターン進んでいるのに登録キャストが空です。' +
        ' hero=' + (heroEmpty ? '(空)' : st.cast.hero.name) +
        ' / npcs=' + ((st.cast.npcs || []).filter(function(n){ return n && n.name; }).length) + '件。' +
        ' 設定画面を通していないか、保存が届いていません。' +
        ' 本文から取れる候補: hero=' + ((p.hero && p.hero.name) || '(なし)') +
        ' npcs=' + (p.npcs.map(function(n){ return n.name; }).join('、') || '(なし)') +
        '  ※このfixは既定では何も書きません。window.__v292Dfix637.report() で詳細。');
    } catch(e){}
    if (applyAllowed()){ try { apply(); } catch(e){} }
    return { turns: turns, heroEmpty: heroEmpty, npcEmpty: npcEmpty, proposal: p };
  }

  function report(){
    var st = getState();
    return {
      turns: (st && Array.isArray(st.turns)) ? st.turns.length : -1,
      heroName: (st && st.cast && st.cast.hero && st.cast.hero.name) || '',
      npcNames: (st && st.cast && Array.isArray(st.cast.npcs))
        ? st.cast.npcs.map(function(n){ return n && n.name; }).filter(Boolean) : [],
      applyAllowed: applyAllowed(),
      deadPaths: deadPaths(),
      proposal: proposal()
    };
  }
  function selfTest(){
    return { off: off(), stateReachable: !!getState(), helpers: !!ab(), warned: warned };
  }

  try { setTimeout(check, 4000); } catch(e){}
  try { setInterval(function(){ try { check(); } catch(e){} }, 30000); } catch(e){}

  window.__v292Dfix637 = {
    __armed: true,
    deadPaths: deadPaths, proposal: proposal, apply: apply,
    check: check, report: report, selfTest: selfTest,
    getState: getState, isOff: off, isApplyAllowed: applyAllowed
  };
  try { if (!off()) console.log(TAG, 'armed (既定は観測のみ・書き込みなし)'); } catch(e){}
})();
