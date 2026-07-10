// =====================================================================
// Chronicle TRPG - v292Dfix415: 開幕演出のメタ指示を表示だけ隠す(表示ガード)
// ---------------------------------------------------------------------
// 背景(2026-07-11 おしん報告):
//   物語開始時、index.html 本体(v30コア) startScene() が開幕演出を
//   STORY入力として自動送信する:
//     inp.value = `物語の幕開け。${l}の景色と空気を遠景から描き、ゆっくり
//                  ${h}のいる場面へズームインする（冒頭から${h}を出さなくてよい）`
//   このメタ演出指示が「ターン1のプレイヤー入力」として履歴先頭(.ptext)に
//   永久表示され、没入感を削ぐ。
//
// 方針(データ・sys・送信内容は絶対に不触。表示だけ隠す):
//   - 該当パターンにテキスト全体がマッチする leaf 要素の textContent を
//     「◈ 物語の幕開け」の一行に置換する(fix350/352/364/371の表示ガード流儀)。
//   - 生成への指示効果は有効なので S.turns / localStorage / 送信body は
//     一切書き換えない(fix66レンダラは S.turns を正とする→触ると本文が壊れる)。
//   - DOM構造/クラスは不触。textContent のみ書換。
//
// 実装:
//   - 対象は「テキスト全体がパターン一致する leaf 要素」を汎用に探す方式。
//     (会話ログ側/「展開の描写」側どちらに出ても拾える。実際の主対象は
//      renderTurn の <span class="ptext"> だが要素構造に依存しすぎない)
//   - 初回全走査 + MutationObserver(childList,subtree,characterData)
//     + 2秒ポーリング(renderAll が毎 render で .turn を作り直すため再適用)。
//   - 冪等: 置換済みは data-f415done 属性 + 置換後テキストは先頭が「◈」で
//     早期returnに掛からないため二重処理しない。
//   - 全角/半角括弧の両方に対応。
//
// 冪等ガード: window.__v292Dfix415
// OFF: localStorage v292Dfix415Off === '1'  (既定ON=表示のみの安全な修正)
// =====================================================================
(function v292Dfix415(){
  'use strict';
  if (window.__v292Dfix415) return;

  var TAG  = '[v292Dfix415:openingMask]';
  var MASK = '◈ 物語の幕開け';
  // startScene() の焼き込み文字列に対応。${l}=場所, ${h}=主人公名 は
  // 可変なので .{n,m} で受ける。全角（）/半角() 両対応。単一行前提(. は改行非対応)。
  var OPENING_RE = /^物語の幕開け。.{1,60}の景色と空気を遠景から描き、ゆっくり.{1,40}のいる場面へズームインする[（(]冒頭から.{1,40}を出さなくてよい[）)]$/;
  var HEAD = '物語の幕開け'; // 早期return用の安価な先頭判定

  function off(){ try { return localStorage.getItem('v292Dfix415Off') === '1'; } catch(e){ return false; } }

  // 単一要素の判定・置換。マッチして置換したら1、それ以外0を返す。
  function processEl(el){
    try {
      if (!el || el.nodeType !== 1) return 0;
      // 既処理は skip
      if (el.getAttribute && el.getAttribute('data-f415done') === '1') return 0;
      // leaf 要素のみ対象(子要素があるコンテナは触らない=構造安全)
      if (el.children && el.children.length > 0) return 0;
      var txt = el.textContent;
      if (!txt) return 0;
      var t = txt.trim();
      // 早期return: 先頭が「物語の幕開け」でなければ即棄却(Observer軽量化)
      if (t.lastIndexOf(HEAD, 0) !== 0) return 0;
      if (!OPENING_RE.test(t)) return 0;
      // 置換(textContent のみ・DOM構造/クラス/属性は不触)
      if (el.setAttribute) el.setAttribute('data-f415done', '1');
      el.textContent = MASK;
      return 1;
    } catch(e){ return 0; }
  }

  // root 配下(root自身含む)の leaf 要素を走査。置換件数を返す。
  function scan(root){
    if (off() || !root) return 0;
    var n = 0;
    try {
      if (root.nodeType === 1) n += processEl(root);
      if (root.querySelectorAll) {
        var all = root.querySelectorAll('*');
        for (var i = 0; i < all.length; i++) n += processEl(all[i]);
      }
    } catch(e){}
    if (n) { try { console.log(TAG, 'masked', n, 'element(s)'); } catch(_){ } }
    return n;
  }

  // ガード確立 + テスト/デバッグ用に内部を公開(表示ガードは副作用のみ)
  window.__v292Dfix415 = {
    RE: OPENING_RE,
    MASK: MASK,
    processEl: processEl,
    scan: scan,
    off: off
  };

  function root(){ return document.body || document.documentElement; }

  // 初回全走査
  try { scan(root()); } catch(e){}

  // MutationObserver: 追加ノード/テキスト変化に追従。mutation対象の部分木のみ
  // 走査し、processEl の早期returnで軽量化する(全DOM再走査はしない)。
  try {
    var mo = new MutationObserver(function(muts){
      if (off()) return;
      for (var i = 0; i < muts.length; i++){
        var m = muts[i];
        if (m.type === 'characterData'){
          var pe = m.target && m.target.parentElement;
          if (pe) processEl(pe);
        } else if (m.addedNodes){
          for (var j = 0; j < m.addedNodes.length; j++){
            var node = m.addedNodes[j];
            if (!node || node.nodeType !== 1) continue;
            scan(node);
          }
        }
      }
    });
    mo.observe(document.documentElement, { childList:true, subtree:true, characterData:true });
  } catch(e){}

  // 2秒ポーリング(renderAll が毎 render で .turn を作り直すため保険)
  try { setInterval(function(){ if (!off()) scan(root()); }, 2000); } catch(e){}

  try { console.log(TAG, 'loaded', off() ? 'OFF' : 'ON'); } catch(_){ }
})();
