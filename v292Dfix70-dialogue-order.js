// =====================================================================
// Chronicle TRPG - v292Dfix70: dialogue-log chronological reorder
// ---------------------------------------------------------------------
// 症状（実機 Chrome MCP で確認）:
//   会話ログ（左カラム）のカード順が narrative 上の時系列と一致しない。
//   - 入力カード（fix56-input-card）が全部先頭にまとまり、
//     dialogue カード（fix64-restored）が後ろにまとまる
//   - さらに同一ターン内でも <say who="X(心)">…</say> の inner-thought が
//     別 pass で抽出され、ターン内の他の dialogue より後に append される
//   例: turn0 の narrative 順は ここは…？ → 起きたか → 無事で良かった だが、
//       会話ログでは 起きたか → 無事で良かった → ここは…？ になっていた
//
// 確定した原因:
//   fix66 (renderhook-repair) は「欠落カードを末尾に append」する設計。
//   各カードは『抽出された順』に並ぶため、『narrative 上の時系列順』に
//   ならない。fix59 が render 時に拾うもの、fix65 が rescue するもの、
//   fix66 が後から補完するもの、で append タイミングが分かれる。
//
// 修正方針:
//   全 turns の narrative を走査し、
//     ターン順 → ターン内の出現順（playerText → <say>/「」/（）の順）
//   で chronological key 列を作る。
//   会話ログの全カードを、その key 列の index で安定ソートして並べ替える。
//   fix66.repair() を wrap し、append 直後に reorder を走らせる
//   （fix66 の render hook は window.__v292Dfix66.repair を live binding で
//    呼ぶので、wrap すれば毎回 reorder が走る）。
//   needsReorder() で既に整列済みなら、 DOM 操作をスキップ（冪等・flicker 防止）。
//
// 実機検証（Chrome MCP, 8 ターンの状態）:
//   Before: [入力8枚][dialogue12枚]、turn0 で ここは…？ が末尾
//   After : フィオナ:廃墟と…(入力) → フィオナ:ここは…？ → ミリア:起きたか →
//           サクラ:無事で良かった → フィオナ�クラとミリアを…(入力) → …
//           = 入力 → そのターンの会話 → 次の入力 の自然な時系列
//   20枚全マッチ、unmatched 0。
//
// 互換性:
//   - fix50..69 は触らない（fix66.repair の wrap + 独立 reorder）
//   - flag: window.__v292Dfix70OrderActive
//   - selfHeal で fix66 再注入時も wrap を保つ
// =====================================================================
(function v292Dfix70_order(){
  'use strict';
  if (window.__v292Dfix70OrderActive) return;
  window.__v292Dfix70OrderActive = true;

  var TAG = '[v292Dfix70:dialogue-order]';

  function norm(t){
    return String(t == null ? '' : t)
      .replace(/[「」『』（）\(\)\s　…⋯。、！？!?\.,]/g, '');
  }

  function getState(){
    try {
      var S = (0, eval)('typeof S !== "undefined" ? S : null');
      if (S && S.turns) return S;
    } catch(e){}
    try {
      var raw = localStorage.getItem('chr6');
      if (raw){ var p = JSON.parse(raw); if (p && p.turns) return p; }
    } catch(e){}
    return { turns: [] };
  }

  // narrative から dialogue text を出現順に抽出
  function extractOrderedTexts(narr){
    if (!narr) return [];
    var s = String(narr), out = [], m;
    // <say who="X">text</say>
    var re = /<say\s+who="[^"]*"\s*>([\s\S]*?)<\/say>/g;
    while ((m = re.exec(s)) !== null) out.push({ pos: m.index, text: m[1].trim() });
    // standalone 「text」 / （text） / (text)  (say 外の地の文セリフ・心の声)
    var re2 = /[「（(]([^「」（）()]{1,60})[」）)]/g;
    while ((m = re2.exec(s)) !== null) out.push({ pos: m.index, text: m[1].trim() });
    out.sort(function(a, b){ return a.pos - b.pos; });
    var seen = {}, res = [];
    out.forEach(function(x){ var n = norm(x.text); if (n && !seen[n]){ seen[n] = 1; res.push(x.text); } });
    return res;
  }

  function buildOrderIndex(){
    var turns = getState().turns || [];
    var oi = {}, idx = 0;
    turns.forEach(function(t){
      if (t && t.playerText){ var n = norm(t.playerText); if (!(n in oi)) oi[n] = idx++; }
      extractOrderedTexts(t && t.narrative).forEach(function(dt){
        var n = norm(dt); if (!(n in oi)) oi[n] = idx++;
      });
    });
    return oi;
  }

  function cardNorm(c){
    var e = c.querySelector('.dlg-text');
    return norm(e ? e.textContent : '');
  }

  function needsReorder(stream, oi){
    var cards = stream.querySelectorAll('.v292-dlg-card');
    var last = -1;
    for (var i = 0; i < cards.length; i++){
      var n = cardNorm(cards[i]);
      var o = (n in oi) ? oi[n] : (10000 + i);
      if (o < last) return true;
      last = o;
    }
    return false;
  }

  function reorder(){
    try {
      var stream = document.getElementById('dialogue-stream');
      if (!stream) return 0;
      var oi = buildOrderIndex();
      if (!needsReorder(stream, oi)) return 0;
      var cards = Array.prototype.slice.call(stream.querySelectorAll('.v292-dlg-card'));
      var dec = cards.map(function(c, di){
        var n = cardNorm(c);
        return { c: c, o: (n in oi) ? oi[n] : (10000 + di), di: di };
      });
      dec.sort(function(a, b){ return a.o !== b.o ? a.o - b.o : a.di - b.di; });
      dec.forEach(function(d){ stream.appendChild(d.c); });
      try { console.log(TAG, 'reordered', dec.length, 'cards chronologically'); } catch(_){}
      return dec.length;
    } catch(e){
      try { console.warn(TAG, 'reorder err:', e && e.message); } catch(_){}
      return 0;
    }
  }
  window.__v292Dfix70Reorder = reorder;

  // ---------- fix66.repair を wrap ----------
  function wrapFix66(){
    try {
      var ns = window.__v292Dfix66;
      if (ns && typeof ns.repair === 'function' && !ns.repair.__v292Dfix70Wrapped){
        var orig = ns.repair;
        var w = function(){
          var r = orig.apply(this, arguments);
          try { reorder(); } catch(e){}
          return r;
        };
        w.__v292Dfix70Wrapped = true;
        ns.repair = w;
        try { console.log(TAG, 'wrapped fix66.repair'); } catch(_){}
        return true;
      }
    } catch(e){}
    return false;
  }

  // 初回 + リトライ + selfHeal
  function tick(){
    wrapFix66();   // fix66 が後から load / reload されても wrap し直す
    reorder();     // 安全ネット（既に整列済みなら no-op）
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', tick);
  } else {
    tick();
  }
  setTimeout(tick, 500);
  setTimeout(tick, 1500);
  setTimeout(tick, 4000);
  setInterval(tick, 2000);

  try { console.log(TAG, 'loaded'); } catch(_){}
})();
