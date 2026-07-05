// =====================================================================
// Chronicle TRPG - v292Dfix389: NPC間の関係の一押し
// おしんの改善案 2026-07-05（fix386「関係の温度計」の弱点補強）
// ---------------------------------------------------------------------
// 動機: fix386で関係は可視化できたが、実機観察でモデルは関係を「主人公向け」に
//   書きがち（4行中3行が対主人公）。NPC同士の関係（信頼/警戒/借り/因縁/親しみ）が
//   溜まりにくく、掛け合いに歴史が宿りにくい。
// 方式（fix387と同じ実証済みパターン: fix379レジストリ prio3 の純注入。状態は持たない）:
//   ・場面にNPCが2人以上いる時だけ注入（1人以下では無意味なのでスキップ）。
//     場面NPC数は fix386 の sceneNames 相当（直近2ターンの地の文＋会話＋player入力に
//     名前が出るNPC。ただし主人公は除外して数える）。
//   ・注入: prio3（予算超過で真っ先に落ちる）。「この場に複数のNPCがいる。彼らは主人公
//     だけでなく互いにも関係・感情を持つ。掛け合い・視線・距離感で滲ませ、可能なら
//     <state>の関係に相手NPC名＝内容も書く。ただし説明台詞にせず押し付けず自然に」。
//     強制でなく“許可”（研究結論の oatmeal 平板化を避ける）。
//   ・block() は純関数（投機的な Planner.build で状態を壊さない）。tick 不要。
// OFF: 既定プレビューOFF。localStorage v292Dfix389==='1' の時だけ動く。
//      全OFF: v292Dfix389Off==='1'（プレビューONでも停止）。
// 検証: window.__v292Dfix389x = { block, status, dryRun, sceneNpcs }。
// =====================================================================
(function(){
  'use strict';
  if (window.__f389done) return; window.__f389done = 1;
  var TAG = '[v292Dfix389:npc-relations]';
  var MIN_NPCS = 2;   // この人数以上のNPCが場面にいる時だけ注入

  function preview(){ try { return localStorage.getItem('v292Dfix389') === '1'; } catch(e){ return false; } }
  function off(){ try { return localStorage.getItem('v292Dfix389Off') === '1'; } catch(e){ return false; } }
  function active(){ return preview() && !off(); }
  function getS(){ try { return window.S || (0,eval)('typeof S!=="undefined" ? S : null'); } catch(e){ return null; } }

  function heroName(){
    try { var S = getS(); if (S && S.cast && S.cast.hero && S.cast.hero.name) return String(S.cast.hero.name); } catch(e){}
    return '';
  }

  // 直近2ターンの地の文＋会話＋player入力を連結。
  function recentText(S){
    var text = '';
    try {
      if (!S || !Array.isArray(S.turns)) return text;
      var start = Math.max(0, S.turns.length - 2);
      for (var i = start; i < S.turns.length; i++){
        var t = S.turns[i]; if (!t) continue;
        if (typeof t.narrative === 'string') text += '\n' + t.narrative;
        else if (Array.isArray(t.narrative)) text += '\n' + t.narrative.join('\n');
        if (typeof t.playerText === 'string') text += '\n' + t.playerText;
        if (Array.isArray(t._convSays)){
          for (var j = 0; j < t._convSays.length; j++){ var cs = t._convSays[j]; if (cs && typeof cs.say === 'string') text += '\n' + cs.say; }
        }
      }
    } catch(e){}
    return text;
  }

  // 候補NPC名（S.cast.npcs ＋ カルテ登録名。主人公は含めない）。
  function candidateNpcNames(){
    var names = [];
    var seen = {};
    var hero = heroName();
    function add(n){ n = String(n || ''); if (n && n !== hero && !seen[n]){ seen[n] = true; names.push(n); } }
    try {
      var S = getS();
      if (S && S.cast){
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

  // 場面内（直近2ターンのテキストに名前が出る）NPC名の配列。主人公は除外。
  function sceneNpcs(){
    var out = [];
    try {
      var S = getS();
      if (!S) return out;
      var text = recentText(S);
      if (!text) return out;
      var cands = candidateNpcNames();
      for (var i = 0; i < cands.length; i++){ if (text.indexOf(cands[i]) >= 0) out.push(cands[i]); }
    } catch(e){}
    return out;
  }

  // 注入ブロック（純関数。状態は変えない）。
  function block(){
    if (!active()) return '';
    try {
      var npcs = sceneNpcs();
      if (npcs.length < MIN_NPCS) return '';
      var body = '\n【NPC間の関係】この場に複数のNPC（' + npcs.slice(0, 4).join('、') + '）がいる。彼らは主人公だけでなく、互いにも関係や感情（信頼・警戒・借り・因縁・親しみ等）を持っている。掛け合い・視線・距離感でそれを滲ませ、可能なら<state>の関係に相手NPC名＝内容の形でも書いてよい。ただし説明台詞にせず、押し付けず、自然に。';
      try { console.log(TAG, 'inject', npcs.length, npcs.slice(0, 4).join(',')); } catch(e){}
      return body;
    } catch(e){ return ''; }
  }

  function status(){
    var S = getS();
    var np = sceneNpcs();
    return {
      preview: preview(), off: off(), active: active(),
      hero: heroName(),
      sceneNpcs: np, sceneNpcCount: np.length,
      willInject: active() && np.length >= MIN_NPCS,
      curTurn: (S && S.turns) ? S.turns.length : null
    };
  }
  // 今promptするなら何が注入されるか（純粋・状態不変）。
  function dryRun(){ return block(); }

  // ---- 注入: fix379レジストリへ登録（喪失レース知らず・prio3=真っ先に予算落ち） ----
  window.__f379reg = window.__f379reg || [];
  window.__f379reg.push({ off: 'v292Dfix389Off', marker: '【NPC間の関係】', prio: 3, text: block });

  window.__v292Dfix389x = { block: block, status: status, dryRun: dryRun, sceneNpcs: sceneNpcs };
  try { console.log(TAG, 'loaded (preview=' + (preview() ? '1' : '0') + ', off=' + (off() ? '1' : '0') + ')'); } catch(e){}
})();
