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
//   - 該当パターンにテキストがマッチする要素の textContent を
//     「◈ 物語の幕開け」の一行に置換する(fix350/352/364/371の表示ガード流儀)。
//   - 生成への指示効果は有効なので S.turns / localStorage / 送信body は
//     一切書き換えない(fix66レンダラは S.turns を正とする→触ると本文が壊れる)。
//   - DOM構造/クラスは不触。textContent と data-* 属性のみ書換。
//
// 実装(2026-07-11 GPT-5.6再監査 H-2/H-3/H-5 対応):
//   - [H-3] 対象を「最初のSTORYターンカードの本文要素(.ptext)」に優先限定。
//     実DOM(index.html renderTurn): #story > .turn > .player-line >
//       <span class="mbadge STORY"> + <span class="ptext">…</span>
//     対象が特定できない場合のみ leaf 全走査へフォールバックし、その場合も
//     「文書内で最初に一致した1要素だけ」をマスク(後続ターンの同文は不触)。
//   - [H-2] 判定前にテキストとパターンの双方を空白正規化(\s+除去)して比較。
//     改行/連続空白/全角スペース(　 は JS の \s に含まれる)に強くする。
//   - [H-5] マスク時に元テキストを data-f415orig に保存し、OFF検知
//     (2秒ポーリング内)で data-f415orig から復元し data-f415done を外す。
//   - 初回走査 + MutationObserver(childList,subtree,characterData)
//     + 2秒ポーリング(renderAll が毎 render で .turn を作り直すため再適用)。
//   - 冪等: 置換済みは data-f415done 属性 + マスク後テキストは NORM_HEAD で
//     始まらないため二重処理しない。全角/半角括弧の両方に対応。
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
  // 可変なので .{n,m} で受ける。全角（）/半角() 両対応。
  // 判定は空白正規化(normWs)済みテキストに対して行うため、パターン中には
  // 空白を一切含めない(焼き込み文字列も元々空白を含まないので等価)。
  var OPENING_RE = /^物語の幕開け。.{1,60}の景色と空気を遠景から描き、ゆっくり.{1,40}のいる場面へズームインする[（(]冒頭から.{1,40}を出さなくてよい[）)]$/;
  var NORM_HEAD  = '物語の幕開け'; // 早期return用の安価な先頭判定(空白なし)

  function off(){ try { return localStorage.getItem('v292Dfix415Off') === '1'; } catch(e){ return false; } }

  // [H-2] 空白正規化: 改行/連続空白/全角スペース等をすべて除去してから比較。
  function normWs(s){ return String(s == null ? '' : s).replace(/\s+/g, ''); }

  // 単一要素の判定・置換(leaf 限定)。マッチして置換したら1、それ以外0。
  // [H-5] 置換前の生テキストを data-f415orig に退避し、OFFで復元可能にする。
  function maskEl(el){
    try {
      if (!el || el.nodeType !== 1) return 0;
      // leaf 要素のみ対象(子要素があるコンテナは触らない=構造安全)
      if (el.children && el.children.length > 0) return 0;
      if (el.getAttribute && el.getAttribute('data-f415done') === '1') return 0;
      var raw = el.textContent;
      if (!raw) return 0;
      var t = normWs(raw);
      // 早期return: 先頭が「物語の幕開け」でなければ即棄却
      if (t.lastIndexOf(NORM_HEAD, 0) !== 0) return 0;
      if (!OPENING_RE.test(t)) return 0;
      if (el.setAttribute) {
        el.setAttribute('data-f415orig', raw); // [H-5] 元テキスト保持
        el.setAttribute('data-f415done', '1');
      }
      el.textContent = MASK; // 表示だけ置換(データ・送信は不触)
      return 1;
    } catch(e){ return 0; }
  }

  function docRoot(){ return document.body || document.documentElement; }

  // [H-3] 主対象 = 最初の STORY ターンカードの .ptext。
  // 見つからない/構造が違う場合は null → フォールバックへ。
  function findPrimaryTarget(){
    try {
      var story = document.getElementById ? document.getElementById('story') : null;
      if (!story || !story.querySelectorAll) return null;
      var turns = story.querySelectorAll('.turn');
      for (var i = 0; i < turns.length; i++){
        var tn = turns[i];
        if (!tn.querySelector) continue;
        if (tn.querySelector('.mbadge.STORY')){
          // 最初の STORY ターンで確定(以降のターンは見ない=後続同文を除外)。
          return tn.querySelector('.ptext') || null;
        }
      }
    } catch(e){}
    return null;
  }

  // フォールバック: root 配下の leaf を走査し「最初に一致した1要素だけ」を
  // マスクして打ち切る(2つ目以降の同文はマスクしない)。
  function maskFirstLeaf(rootNode){
    if (!rootNode) return 0;
    try {
      if (rootNode.nodeType === 1 && maskEl(rootNode)) return 1;
      if (rootNode.querySelectorAll){
        var all = rootNode.querySelectorAll('*');
        for (var i = 0; i < all.length; i++){
          if (maskEl(all[i])) return 1;
        }
      }
    } catch(e){}
    return 0;
  }

  // 走査本体: 主対象優先、無ければフォールバック(最初の1要素のみ)。
  function applyMask(){
    if (off()) return 0;
    var n = 0;
    try {
      var primary = findPrimaryTarget();
      if (primary){
        // 主対象が特定できたら、その要素だけを判定対象にする。
        // (パターン不一致=開幕文でない → マスクしない。フォールバックもしない)
        n = maskEl(primary);
      } else {
        n = maskFirstLeaf(docRoot());
      }
    } catch(e){}
    if (n) { try { console.log(TAG, 'masked', n, 'element(s)'); } catch(_){ } }
    return n;
  }

  // [H-5] OFF 時の復元: data-f415orig を持つ要素を元テキストへ戻す。
  function restoreAll(){
    var n = 0;
    try {
      var els = document.querySelectorAll ? document.querySelectorAll('[data-f415orig]') : null;
      if (!els) return 0;
      for (var i = 0; i < els.length; i++){
        var el = els[i];
        try {
          var o = el.getAttribute('data-f415orig');
          if (o != null) el.textContent = o;
          el.removeAttribute('data-f415orig');
          el.removeAttribute('data-f415done');
          n++;
        } catch(e){}
      }
    } catch(e){}
    if (n) { try { console.log(TAG, 'restored', n, 'element(s)'); } catch(_){ } }
    return n;
  }

  // ガード確立 + テスト/デバッグ用に内部を公開(表示ガードは副作用のみ)
  window.__v292Dfix415 = {
    RE: OPENING_RE,
    MASK: MASK,
    normWs: normWs,
    maskEl: maskEl,
    findPrimaryTarget: findPrimaryTarget,
    maskFirstLeaf: maskFirstLeaf,
    applyMask: applyMask,
    restoreAll: restoreAll,
    scan: applyMask, // 後方互換の別名
    off: off
  };

  // 初回走査
  try { applyMask(); } catch(e){}

  // MutationObserver: 追加ノード/テキスト変化に追従。批次ごとに applyMask を
  // 1回だけ実行(対象は主対象 or 最初の1要素なので軽量。マスク後は
  // NORM_HEAD 不一致で no-op になりループしない)。
  try {
    var mo = new MutationObserver(function(){
      if (off()) return;
      applyMask();
    });
    mo.observe(document.documentElement, { childList:true, subtree:true, characterData:true });
  } catch(e){}

  // 2秒ポーリング(renderAll が毎 render で .turn を作り直すため保険)。
  // [H-5] OFF 検知時は即復元(既マスクDOMを次の再描画を待たずに戻す)。
  try {
    setInterval(function(){
      if (off()) restoreAll();
      else applyMask();
    }, 2000);
  } catch(e){}

  try { console.log(TAG, 'loaded', off() ? 'OFF' : 'ON'); } catch(_){ }
})();
