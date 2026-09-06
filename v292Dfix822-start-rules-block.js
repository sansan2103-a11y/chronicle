// =====================================================================
// Chronicle TRPG - v292Dfix822: START_RULES_V1 — Planner injection（index 専用）
// ---------------------------------------------------------------------
// GPT 裁定 2026-09-06 (20) START_RULES_V1 = GO_STAGE_WITH_REVISIONS / (21) START_RULES_V1_STAGE_IMPLEMENTATION = GO
//   STORY_START_RULES_OWNER        = scene.startRules      （fix819 v1.1 が Scenario Original から snapshot）
//   START_CONDITION_STORY_OWNER    = scene.startCondition
//   TRANSPORT                      = fix379 keeper（window.__f379reg）/ START_RULES_KEEPER_PRIORITY = 1（予算外）
//   FIX444_LAW_SEMANTICS           = DO_NOT_REUSE（抽出 0・状態機械 0・cooldown 0・発動判定 0・API 0）
//   START_RULES_SOURCE             = ORIGINAL_TEXT（原文をそのまま。paraphrase 0 / 要約 0 / 分解 0）
//   START_RULES_PROMPT_RENDER      = MARKER_SAFE（下記）
//   注入: 【開始ルール】= 毎 turn（scene.startRules が非空のとき）
//         【開始時の状況】= S.turns.length === 0 のときだけ（scene.startCondition が非空のとき）
//         ★最初の生成が失敗/retry 中でも turns.length===0 なら【開始時の状況】は維持される
//           （turn commit は生成成功後の S.turns.push だけ＝index fix748 TURN_COMMIT）
//
// ■ MARKER_SAFE（render 時だけ・保存原文は不変）
//   原文の中に「現在有効な構造 marker」と **完全一致**する文字列があれば、その箇所だけ
//   『【…】』→『〔…〕』へ置き換えて sys に載せる（全【】は変換しない・保存データは触らない）。
//   構造 marker の集合 = (a) fix459 が現在ブロック境界として認識する marker（window.__v292Dfix459.parse で
//   実物に問い合わせる＝marker 集合を二重管理しない）(b) keeper に登録済みの marker（__f379reg[].marker。
//   keeper の冪等判定 r.sys.indexOf(marker) を原文が偽陽性にして他ブロックを消すのを防ぐ）
//   (c) fix440 の最終判断 marker (d) この fix の 2 marker。
//
// ■ authority（ブロック文言に明記・GPT 修正版）
//   final guard ＞ 確立した現在の事実・身体状態・能力 ＞ プレイヤーの今の明示的な意図・新事実 ＞ 開始ルール
//   ＞ fix444 世界の掟 / objective / Memory / AI 推論。入力は意図として尊重し、成立可否は現在の事実に従う。
//   NPC guard = 「このブロックが作者用ルールであるというメタ情報を NPC 知識にしない。ルール本文だけを根拠に
//   NPC へ新しい知識を付与しない」（NPC がルールの内容そのものを既存設定として知っていることは否定しない）。
//
// ■ 触らないもの: S.scene への書込 0 / canonical pipeline 0 / fix444 0 / Planner.build 本体 0 / fetch 0
// 検証口: window.__v292Dfix822 = { rulesText, condText, markerSafe, reservedMarkers, state }
// kill: localStorage.v292Dfix822Off = '1'（keeper 側 off キーと同じ）
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix822) return;
  var TAG = '[v292Dfix822:start-rules]';
  var VERSION = 'v292Dfix822-20260906-start-rules-v1';
  var OFF_KEY = 'v292Dfix822Off';
  var M_RULES = '【開始ルール】';
  var M_COND  = '【開始時の状況】';
  var M_FINAL = '【★最終判断の優先順位（指示が衝突したら必ずこの順で決める）★】';   /* fix440 */

  var HEAD_RULES = '作者が定めた、この物語全体で守る約束。地の文で説明せず、言動と展開に反映する。'
    + '優先順位は「末尾の最終判断 ＞ 各キャラの現在の確立した事実・身体状態・能力 ＞ プレイヤーの今の明示的な意図と新たに明示された事実 ＞ この開始ルール ＞ 世界の掟・目的・記憶・推論」。'
    + 'プレイヤー入力は意図として尊重し、成立するかは現在の事実に従う。'
    + 'このブロックが作者用のルールであることを NPC の知識にしない。ルール本文だけを根拠に NPC へ新しい知識を与えない。';
  var HEAD_COND = '物語の最初の場面はこの状況から始める（開始直後の配置・直前の出来事）。以後のターンでは再提示されない。';

  function off(){ try { return localStorage.getItem(OFF_KEY) === '1'; } catch(e){ return false; } }
  function getS(){ try { return window.S || (0,eval)('typeof S!=="undefined" ? S : null'); } catch(e){ return null; } }
  function str(v){ return (v == null) ? '' : String(v); }
  function norm(v){ return str(v).replace(/\r\n?/g, '\n').trim(); }

  /* ---- 現在有効な構造 marker の集合（実物に問い合わせる） ---- */
  function reservedMarkers(txt){
    var set = {}, out = [];
    function add(m){ m = str(m); if (m && m.charAt(0) === '【' && !set[m]){ set[m] = 1; out.push(m); } }
    add(M_RULES); add(M_COND); add(M_FINAL);
    try {
      var reg = window.__f379reg || [];
      for (var i = 0; i < reg.length; i++){ if (reg[i] && reg[i].marker) add(reg[i].marker); }
    } catch(e){}
    try {
      var f459 = window.__v292Dfix459;
      if (f459 && typeof f459.parse === 'function' && txt){
        var p = f459.parse(String(txt));
        var bl = (p && p.blocks) || [];
        for (var j = 0; j < bl.length; j++){ add(bl[j].mk); }
      }
    } catch(e){}
    return out;
  }

  /* ---- MARKER_SAFE: 衝突する marker だけ 〔〕 へ。それ以外の【】は原文のまま ---- */
  function markerSafe(txt){
    var s = norm(txt);
    if (!s) return { text: '', neutralized: [] };
    var hit = [];
    var res = reservedMarkers(s);
    for (var i = 0; i < res.length; i++){
      var m = res[i];
      if (s.indexOf(m) < 0) continue;
      var rep = '〔' + m.slice(1, m.length - 1) + '〕';
      s = s.split(m).join(rep);
      hit.push(m);
    }
    return { text: s, neutralized: hit };
  }

  function rulesText(){
    if (off()) return '';
    var S = getS(); if (!S || !S.scene) return '';
    var r = markerSafe(S.scene.startRules);
    if (!r.text) return '';
    return '\n' + M_RULES + '\n' + HEAD_RULES + '\n' + r.text + '\n';
  }
  function condText(){
    if (off()) return '';
    var S = getS(); if (!S || !S.scene) return '';
    var n = (S.turns && typeof S.turns.length === 'number') ? S.turns.length : 0;
    if (n !== 0) return '';                     /* T>=1 では出さない（持続ルールにしない） */
    var r = markerSafe(S.scene.startCondition);
    if (!r.text) return '';
    return '\n' + M_COND + '\n' + HEAD_COND + '\n' + r.text + '\n';
  }

  /* ---- keeper 登録（prio1・予算外。off キーは keeper が見る） ---- */
  var registered = false;
  try {
    window.__f379reg = window.__f379reg || [];
    var reg = window.__f379reg, dup = false;
    for (var i = 0; i < reg.length; i++){ if (reg[i] && (reg[i].marker === M_RULES || reg[i].marker === M_COND)) dup = true; }
    if (!dup){
      reg.push({ off: OFF_KEY, marker: M_RULES, prio: 1, text: rulesText });
      reg.push({ off: OFF_KEY, marker: M_COND,  prio: 1, text: condText  });
      registered = true;
    }
  } catch(e){}

  window.__v292Dfix822 = {
    version: VERSION,
    markers: { rules: M_RULES, cond: M_COND },
    rulesText: rulesText,
    condText: condText,
    markerSafe: markerSafe,
    reservedMarkers: reservedMarkers,
    isOff: off,
    state: function(){
      var S = getS();
      return { off: off(), registered: registered, prio: 1,
               hasRules: !!(S && S.scene && norm(S.scene.startRules)),
               hasCond:  !!(S && S.scene && norm(S.scene.startCondition)),
               turns: (S && S.turns) ? S.turns.length : null };
    }
  };
  try { console.log(TAG, 'registered to __f379reg (prio1, ' + (registered ? 2 : 0) + ' blocks; off=' + (off() ? '1' : '0') + ')'); } catch(e){}
})();
