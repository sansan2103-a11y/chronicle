// =====================================================================
// Chronicle TRPG - v292Dfix477: 入力履歴（Chromeオートフィル）の無効化
// ---------------------------------------------------------------------
// 背景(2026-07-16):
//   主人公名入力(#cfgHName)やNPC編集行・各種モーダルの input/textarea に
//   Chromeのオートフィル候補やパスワードマネージャの割り込みが出て没入感を
//   削ぐ。document内の input / textarea に autocomplete="off"（inputには
//   data-lpignore="true" も）を付与して抑止する。
//
//   (1)ロード時に一括適用 (2)MutationObserver(childList,subtree)で動的追加分
//   （NPC編集行・モーダルは動的生成のため必須）にも適用。
//
//   ★index.html変更・デプロイは親が別途行う。本ファイルは新規1ファイルで完結。
// ---------------------------------------------------------------------
// 方針:
//   - 既に明示 autocomplete 指定がある要素は尊重して触らない（hasAttribute判定）。
//   - name属性は変更しない（フォーム送信互換）。
//   - 例外: type=password / [data-ac-keep] は一切触らない。
//   - 冪等: 適用済みは dataset印(v292Dfix477)でskip。
//   - OFF=localStorage.v292Dfix477Off==='1'（live評価）。OFF時はobserver素通し・
//     ロード時一括適用もしない。既適用分は残ってよい（無害）。
//
// 検証口: window.__v292Dfix477 = { applyOne, applyAll, applyTree, status }
// =====================================================================
(function(){
  'use strict';
  if (window.__v292Dfix477 && window.__v292Dfix477.__armed) return;   // 二重arm禁止
  var TAG = '[v292Dfix477:autocomplete-off]';

  // ---------- OFF スイッチ（live評価） ----------
  function off(){
    try { return localStorage.getItem('v292Dfix477Off') === '1'; } catch(e){ return false; }
  }

  // ---------- 1要素への適用 ----------
  function applyOne(el){
    try {
      if (!el || el.nodeType !== 1) return;                     // Elementのみ
      var tag = el.tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA') return;
      // 冪等: 適用済みはskip
      if (el.dataset && el.dataset.v292Dfix477 === '1') return;
      // 例外: data-ac-keep は一切触らない
      if (el.hasAttribute && el.hasAttribute('data-ac-keep')) return;
      // 例外: input[type=password] は触らない
      if (tag === 'INPUT') {
        var typ = (el.getAttribute('type') || '').toLowerCase();
        if (typ === 'password') return;
      }
      // 既に明示 autocomplete 指定がある要素は尊重して触らない
      if (el.hasAttribute && el.hasAttribute('autocomplete')) return;

      // 付与（name属性は変更しない）
      el.setAttribute('autocomplete', 'off');
      if (tag === 'INPUT') el.setAttribute('data-lpignore', 'true');   // Chrome/LastPass対策
      // 適用印
      if (el.dataset) el.dataset.v292Dfix477 = '1';
      else el.setAttribute('data-v292dfix477', '1');
    } catch(e){}
  }

  // ---------- ノード配下の input/textarea へ適用（追加ノード自身も含む） ----------
  function applyTree(root){
    try {
      if (!root || root.nodeType !== 1) return;
      applyOne(root);                                            // 追加ノード自身
      if (root.querySelectorAll) {
        var list = root.querySelectorAll('input,textarea');
        for (var i = 0; i < list.length; i++) applyOne(list[i]);
      }
    } catch(e){}
  }

  // ---------- ロード時の一括適用 ----------
  function applyAll(){
    try {
      if (off()) return;                                         // OFF時は一括適用もしない
      if (!document.querySelectorAll) return;
      var list = document.querySelectorAll('input,textarea');
      for (var i = 0; i < list.length; i++) applyOne(list[i]);
    } catch(e){}
  }

  // ---------- MutationObserver（動的追加分） ----------
  var mo = null;
  function armObserver(){
    try {
      if (mo || typeof MutationObserver === 'undefined') return;
      mo = new MutationObserver(function(muts){
        if (off()) return;                                       // OFF時は素通し
        for (var i = 0; i < muts.length; i++){
          var added = muts[i].addedNodes;
          if (!added) continue;
          for (var j = 0; j < added.length; j++) applyTree(added[j]);
        }
      });
      var target = document.documentElement || document.body || document;
      mo.observe(target, { childList: true, subtree: true });
    } catch(e){ try { console.warn(TAG, 'observer arm failed', e); } catch(_){} }
  }

  // ---------- arm ----------
  try {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function(){ applyAll(); armObserver(); }, { once: true });
    }
    applyAll();          // 既に存在するノードへ即適用（読み込みタイミングに依らず）
    armObserver();       // observerは常時（OFFはコールバック側でlive判定）
  } catch(e){ try { console.warn(TAG, 'arm error', e); } catch(_){} }

  // ---------- 検証口 ----------
  window.__v292Dfix477 = {
    __armed: true,
    applyOne: applyOne,
    applyTree: applyTree,
    applyAll: applyAll,
    status: function(){ return { off: off(), armed: true, observer: !!mo }; }
  };
  try { console.log(TAG, 'armed; off:', off()); } catch(e){}
})();
