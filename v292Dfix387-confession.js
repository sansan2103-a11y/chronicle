// =====================================================================
// Chronicle TRPG - v292Dfix387: 打ち明けの演出（wound の遅延開示トリガー）
// おしんの改善案◎2「打ち明けの演出（coreDesire/woundの遅延開示）」2026-07-05
// ---------------------------------------------------------------------
// 目的: NPCは coreDesire/coreFear/wound を持つが、その開示タイミングはモデル任せ。
//   「静かな場面が続いたら、まだ打ち明けていない wound を持つNPCが、ふとした拍子に
//    その一端を小さく漏らす」ソフトなトリガーを足し、秘密を「いつか開く箱」にする。
// 方式（fix386と同じ実証済みパターン: fix379レジストリ prio3 + tick確定）:
//   ・静けさ判定: fix333の品質ログ(v292Dfix333Qual)の直近2件が共に scene==='calm'
//     かつ melodrama 空（＝静かで、まだ感情が高ぶっていない）。fix333のsceneclassifier
//     を再利用するので独自ヒューリスティック不要。
//   ・対象: 直近2ターンの地の文に名前が出ている（＝場面内の）NPCで、wound を持つ者。
//     最も長く打ち明けを促していない順にローテーション（1人だけ）。
//   ・クールダウン: 直近の促しから最低 COOLDOWN ターン空ける（連発・melodrama化を防ぐ）。
//   ・注入: prio3（予算超過で真っ先に落ちる）。「今なら○○が古い傷の一端を断片的に
//     漏らしても自然。1人だけ・押し付けず・無理なら流す」というソフトな“許可”。強制しない。
//   ・状態確定: block() は純関数（投機的な Planner.build で状態を壊さない）。実際に
//     ターンが進んだ時だけ tick が「促した」記録を確定する（lastPromptTurn / lastNudged）。
// 設計思想: 研究結論「過剰制約 oatmeal 平板化が最悪」に沿い、強制でなく“許可”。静かな
//   時のみ・1人・クールダウン付き・ローテで、melodrama の山積みを避ける。melodrama指標で監視。
// OFF: 既定プレビューOFF。localStorage v292Dfix387==='1' の時だけ動く。
//      全OFF: v292Dfix387Off==='1'（プレビューONでも停止）。
// 検証: window.__v292Dfix387x = { block, status, dryRun }。
// =====================================================================
(function(){
  'use strict';
  if (window.__f387done) return; window.__f387done = 1;
  var TAG = '[v292Dfix387:confession]';
  var COOLDOWN = 3;      // 促し同士の最小ターン間隔
  var MIN_TURNS = 3;     // 開幕直後は促さない
  var MAX_WOUND = 44;    // sysに出す wound 要約の最大文字数
  var SKEY = 'v292Dfix387State';

  function preview(){ try { return localStorage.getItem('v292Dfix387') === '1'; } catch(e){ return false; } }
  function off(){ try { return localStorage.getItem('v292Dfix387Off') === '1'; } catch(e){ return false; } }
  function active(){ return preview() && !off(); }
  function getS(){ try { return window.S || (0,eval)('typeof S!=="undefined" ? S : null'); } catch(e){ return null; } }

  // fix333 の品質ログを読む（配列）。直近ほど末尾。
  function readQual(){
    try { var raw = localStorage.getItem('v292Dfix333Qual'); if (raw) return JSON.parse(raw); } catch(e){}
    try { var api = window.__v292Dfix333api; if (api && typeof api.qualStats === 'function'){ var r = api.qualStats(); if (Array.isArray(r)) return r; } } catch(e){}
    return null;
  }
  function lastScene(){ try { var q = readQual(); if (q && q.length) return q[q.length-1].scene || '?'; } catch(e){} return '?'; }

  // 静か: 直近2件が共に calm かつ melodrama 空。
  function isQuiet(){
    try {
      var q = readQual();
      if (!q || q.length < 2) return false;
      var last2 = q.slice(-2);
      return last2.every(function(e){ return e && e.scene === 'calm' && (!e.melodrama || e.melodrama.length === 0); });
    } catch(e){ return false; }
  }

  // 直近nターンの地の文＋会話を連結。
  function recentText(S, n){
    var text = '';
    try {
      if (!S || !Array.isArray(S.turns)) return text;
      var start = Math.max(0, S.turns.length - n);
      for (var i = start; i < S.turns.length; i++){
        var t = S.turns[i]; if (!t) continue;
        if (typeof t.narrative === 'string') text += '\n' + t.narrative;
        else if (Array.isArray(t.narrative)) text += '\n' + t.narrative.join('\n');
        if (Array.isArray(t._convSays)){
          for (var j = 0; j < t._convSays.length; j++){ var cs = t._convSays[j]; if (cs && cs.say) text += '\n' + cs.say; }
        }
      }
    } catch(e){}
    return text;
  }

  // 場面内 かつ wound を持つ NPC 一覧。
  function eligibleNpcs(S){
    var out = [];
    try {
      var text = recentText(S, 2);
      var npcs = (S && S.cast && S.cast.npcs) || [];
      for (var i = 0; i < npcs.length; i++){
        var n = npcs[i];
        if (!n || !n.name) continue;
        var w = n.wound ? String(n.wound).replace(/^[\s　]+|[\s　]+$/g, '') : '';
        if (!w) continue;
        if (text.indexOf(n.name) < 0) continue;   // 場面内にいない
        out.push({ name: n.name, wound: w });
      }
    } catch(e){}
    return out;
  }

  function shortWound(w){
    w = String(w || '').replace(/[。\.]\s*$/, '');
    if (w.length > MAX_WOUND) w = w.slice(0, MAX_WOUND) + '…';
    return w;
  }

  function loadState(){
    try { var r = localStorage.getItem(SKEY); if (r){ var o = JSON.parse(r); if (o && typeof o === 'object'){ o.lastNudged = o.lastNudged || {}; if (typeof o.lastPromptTurn !== 'number') o.lastPromptTurn = -99; return o; } } } catch(e){}
    return { lastPromptTurn: -99, lastNudged: {} };
  }
  function saveState(s){ try { if (!document.hidden) localStorage.setItem(SKEY, JSON.stringify(s)); } catch(e){} }

  // 注入ブロック（純関数。状態は変えない。促す予定を __f387proposal に控えるだけ）。
  function block(){
    if (!active()) return '';
    try {
      var S = getS();
      if (!S || !Array.isArray(S.turns)) return '';
      var curTurn = S.turns.length;           // 完了済みターン数（＝これから curTurn+1 を生成）
      if (curTurn < MIN_TURNS) return '';
      if (!isQuiet()) return '';
      var st = loadState();
      if (curTurn - (st.lastPromptTurn || -99) < COOLDOWN) return '';
      var elig = eligibleNpcs(S);
      if (!elig.length) return '';
      // 最も長く促していない順（未促し=-1が先頭）。
      elig.sort(function(a, b){ return (st.lastNudged[a.name] == null ? -1 : st.lastNudged[a.name]) - (st.lastNudged[b.name] == null ? -1 : st.lastNudged[b.name]); });
      var pick = elig[0];
      window.__f387proposal = { npc: pick.name, atTurn: curTurn };   // tickが確定する
      var w = shortWound(pick.wound);
      var body = '\n【打ち明け】場が落ち着いている。今なら' + pick.name + 'が、ふとした拍子に自分の古い傷（' + w + '）の一端を、説明ゼリフにせず断片的に漏らしても自然だ。1人だけ・小さく・押し付けず、無理なら流してよい。';
      try { console.log(TAG, 'nudge', pick.name); } catch(e){}
      return body;
    } catch(e){ return ''; }
  }

  function status(){
    var S = getS();
    return {
      preview: preview(), off: off(),
      quiet: isQuiet(), lastScene: lastScene(),
      eligible: S ? eligibleNpcs(S).map(function(e){ return e.name; }) : [],
      state: loadState(),
      curTurn: (S && S.turns) ? S.turns.length : null
    };
  }
  // 今promptするなら何が注入されるか（純粋・状態不変）。
  function dryRun(){ return block(); }

  // ---- 注入: fix379レジストリへ登録（喪失レース知らず・prio3=真っ先に予算落ち） ----
  window.__f379reg = window.__f379reg || [];
  window.__f379reg.push({ off: 'v292Dfix387Off', marker: '【打ち明け】', prio: 3, text: block });

  // ---- 状態確定: 8秒ポーリング。実際にターンが進んだ時だけ「促した」記録を書く ----
  var lastLen = -1;
  function tick(){
    try {
      if (!active()) return;
      var S = getS();
      var len = (S && Array.isArray(S.turns)) ? S.turns.length : -1;
      if (len === lastLen) return;
      var prev = lastLen; lastLen = len;
      var p = window.__f387proposal;
      if (p){
        if (p.atTurn === prev && len > prev){
          var st = loadState();
          st.lastPromptTurn = p.atTurn;
          st.lastNudged[p.npc] = p.atTurn;
          saveState(st);
          window.__f387proposal = null;
        } else if (p.atTurn < prev){
          window.__f387proposal = null; // 促さずにターンが過ぎた＝破棄
        }
      }
    } catch(e){}
  }
  try { setInterval(tick, 8000); } catch(e){}

  window.__v292Dfix387x = { block: block, status: status, dryRun: dryRun };
  try { console.log(TAG, 'loaded (preview=' + (preview() ? '1' : '0') + ', off=' + (off() ? '1' : '0') + ')'); } catch(e){}
})();
