// === v292Dfix56: conversation-log fix + GM-mode placeholder clarification ===
//
// 直前ライブで発生した致命的回帰の修正:
//   ユーザー報告:
//     - 「会話ログ」パネルが完全に空 (ヘッダーだけ)
//     - 入力したセリフが期待通りに反映されない
//     - 入力欄 placeholder が STORY モード固定に見える (実は GM モードの override)
//
// 解析結果 (原因の組み合わせ — A/B/C/D 仮説のうち B + 派生):
//
//   [B-1] v292Dfix55 placeholder MutationObserver の暴走:
//         GM モード ON のとき、setMode(DO/SAY/STORY) で placeholder を変更しても
//         即座に "主人公として何をする？何を言う？" に上書きされる。
//         → ユーザーは現在モードが判別できず、STORY モードのつもりで SAY 入力
//           したり、その逆をやってしまう。
//
//   [B-2] GM モード sys prompt の副作用:
//         「主人公の台詞、行動、内心、選択は、プレイヤーが SAY/DO で明示的に
//          入力した時のみ反映してください」が強すぎて、STORY モードで何か
//          入力しても主人公が一切登場しない → ナラティブが NPC 描写だけになる
//         → 「」マークも省略されがちで dialogue extractor が拾えない → 会話ログ空。
//
//   [B-3] dialogue stream の安全網不足:
//         renderStreamV15 (v292Dfix15) は SAY 入力に対してのみ主人公カードを
//         事前 push する。DO/STORY 入力の playerText は dialogue panel に何の
//         痕跡も残さない → 入力したのに会話ログが空に見える原因。
//
// 修正方針 (独立 IIFE、setInterval なし、wrap cascade 回避):
//
//   (1) Placeholder の mode-aware 化:
//       fix55 が attach した MutationObserver を、inp の cloneNode で物理的に
//       disconnect。clone に __v292Dfix55PhWatched=true を pre-set して fix55 の
//       再 attach も止める。我々が独自に mode-aware な GM 表示を attach する。
//
//   (2) G.setMode の wrap:
//       wrap で原 setMode を呼び、その後 GM 用 placeholder を即座に上書き。
//       これで mode 切替直後の placeholder も正しく出る。
//
//   (3) Dialogue stream にユーザー入力カードを必ず push:
//       renderStream を上書き (window.__v292.dialogueLayout.renderStream)。
//       SAY: 既存通り hero カード
//       DO:  「[DO]」プレフィックスで hero アクションカード
//       STORY: 「[STORY]」プレフィックスで hero ストーリーカード
//
//   (4) GM badge を mode ボタン列の隣に表示:
//       現在 GM モードかどうかが UI 上で一目でわかるようにする。
//
// 注意:
//   - v292Dfix54 / v292Dfix55 自体は壊さない (sys prompt 注入や設定 UI は維持)
//   - extraction ロジックは触らない (壊すリスクが高い)
//   - フラグ: window.__v292Dfix56Active
//
(function v292Dfix56(){
  'use strict';
  if (window.__v292Dfix56Active) return;
  window.__v292Dfix56Active = true;

  var TAG = '[v292Dfix56:conv-log-fix]';
  var STORAGE_KEY = 'chr6_protagonistMode';

  // ---------- helpers ----------
  function isGm(){
    try { return localStorage.getItem(STORAGE_KEY) === 'gm'; }
    catch(e){ return false; }
  }

  function currentInputMode(){
    // v292Dfix55 placeholder MO 競合下でも信頼できる: .mdbtn の active suffix で判定
    var btns = document.querySelectorAll('.mdbtn');
    for (var i = 0; i < btns.length; i++){
      var c = btns[i].className || '';
      if (/\baDO\b/.test(c)) return 'DO';
      if (/\baSAY\b/.test(c)) return 'SAY';
      if (/\baSTORY\b/.test(c)) return 'STORY';
    }
    // fallback to S.mode if exposed
    try {
      if (window.S && window.S.mode) return String(window.S.mode);
    } catch(e){}
    return 'STORY';
  }

  function getHeroName(){
    try {
      if (window.S && window.S.cast && window.S.cast.hero && window.S.cast.hero.name)
        return String(window.S.cast.hero.name);
    } catch(e){}
    try {
      var raw = JSON.parse(localStorage.getItem('chr6') || '{}');
      if (raw && raw.cast && raw.cast.hero && raw.cast.hero.name)
        return String(raw.cast.hero.name);
    } catch(e){}
    return '主人公';
  }

  // ---------- (1) + (2) Placeholder mode-aware ----------
  // base placeholders (index.html setMode と同一)
  var BASE_PH = {
    DO:    '行動を入力… 例: 女の子に声をかける',
    SAY:   'セリフを入力… 例: 「名前を教えてくれ」',
    STORY: '描写の方向を入力… 例: 遠くから足音が近づく'
  };

  function modePlaceholder(mode){
    var base = BASE_PH[mode] || BASE_PH.STORY;
    return isGm() ? base + ' 【GMモード】' : base;
  }

  var __replaced = false;
  function replaceInpToDisconnectMOs(){
    if (__replaced) return document.getElementById('inp');
    var inp = document.getElementById('inp');
    if (!inp || !inp.parentNode) return null;

    var clone = inp.cloneNode(true);     // shallow copy of attributes + inline handlers
    clone.value = inp.value;              // textareas need explicit value copy

    // 重要: fix55 が再度 watchInputPlaceholder で attach しに来るのを止める
    //       (fix55 は inp.__v292Dfix55PhWatched が真なら早期 return する)
    clone.__v292Dfix55PhWatched = true;

    // 高さスタイルの引継ぎ (oninput が起動するまでの間 0 高にならないように)
    if (inp.style.height) clone.style.height = inp.style.height;

    inp.parentNode.replaceChild(clone, inp);
    __replaced = true;
    console.log(TAG, 'inp cloned to disconnect fix55 MO; __v292Dfix55PhWatched=true preset');
    return clone;
  }

  function applyModeAwarePlaceholder(mode){
    var inp = document.getElementById('inp');
    if (!inp) return;
    var want = modePlaceholder(mode || currentInputMode());
    if (inp.placeholder !== want) inp.placeholder = want;
  }

  function wrapSetMode(){
    var G = window.G;
    if (!G || typeof G.setMode !== 'function') {
      setTimeout(wrapSetMode, 300);
      return;
    }
    if (G.__v292Dfix56WrappedSetMode) return;
    var orig = G.setMode.bind(G);
    G.setMode = function(m){
      var r = orig(m);
      try { applyModeAwarePlaceholder(m); } catch(e){}
      return r;
    };
    G.__v292Dfix56WrappedSetMode = true;
    console.log(TAG, 'G.setMode wrapped (mode-aware placeholder)');
  }

  // mode 変更を検知して mode-aware placeholder を維持 (mdbtn class 変化を watch)
  function watchModeButtons(){
    var btnBar = document.querySelector('.mdbtn') && document.querySelector('.mdbtn').parentNode;
    if (!btnBar) {
      setTimeout(watchModeButtons, 300);
      return;
    }
    if (btnBar.__v292Dfix56ModeWatched) return;
    btnBar.__v292Dfix56ModeWatched = true;
    var mo = new MutationObserver(function(){
      // class 変化 = mode 切替 → placeholder 再適用
      try { applyModeAwarePlaceholder(); } catch(e){}
    });
    mo.observe(btnBar, { subtree: true, attributes: true, attributeFilter: ['class'] });
    console.log(TAG, 'mdbtn class observer attached');
  }

  // ---------- (3) Dialogue stream: ALWAYS push user input card ----------
  function escHtml(s){
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getAvatarFromHelpers(speaker){
    // try existing helpers if available
    try {
      if (window.__v292 && window.__v292.dfix15 && typeof window.__v292.dfix15.getAvatar === 'function'){
        return window.__v292.dfix15.getAvatar(speaker);
      }
    } catch(e){}
    try {
      if (window.S && window.S.cast){
        var hero = window.S.cast.hero;
        if (hero && hero.name === speaker && hero.avatar) return hero.avatar;
        if (Array.isArray(window.S.cast.npcs)){
          for (var i = 0; i < window.S.cast.npcs.length; i++){
            var n = window.S.cast.npcs[i];
            if (n && n.name === speaker && n.avatar) return n.avatar;
          }
        }
      }
    } catch(e){}
    return null;
  }

  function buildUserInputCard(turn, heroName){
    var inputType = turn && turn.inputType;
    var text = turn && turn.playerText;
    if (!text || !inputType) return null;
    if (inputType === 'SAY') return null; // 既存 renderStream が hero カードを push してくれる

    var av = getAvatarFromHelpers(heroName);
    var avHtml = av
      ? '<img src="' + escHtml(av) + '" alt="' + escHtml(heroName) + '" loading="lazy"'
        + ' onerror="this.parentNode.textContent=String.fromCharCode(63)">'
      : '?';

    var card = document.createElement('div');
    card.className = 'v292-dlg-card hero-card v292Dfix56-input-card';
    // tag を視覚的に区別
    var tagBg = inputType === 'DO' ? 'rgba(90,142,240,.18)' : 'rgba(196,144,64,.18)';
    var tagFg = inputType === 'DO' ? 'var(--do,#5a8ef0)' : 'var(--story,#c49040)';
    var tagLabel = inputType === 'DO' ? '⚔ 行動' : '📖 展開';
    card.innerHTML =
      '<div class="dlg-av">' + avHtml + '</div>'
      + '<div class="dlg-body">'
      +   '<div class="dlg-name">' + escHtml(heroName)
      +     ' <span style="font-size:10px;padding:1px 6px;margin-left:6px;border-radius:8px;'
      +     'background:' + tagBg + ';color:' + tagFg + ';font-weight:600">'
      +     escHtml(tagLabel)
      +     '</span>'
      +   '</div>'
      +   '<div class="dlg-text" style="opacity:.85">' + escHtml(text) + '</div>'
      + '</div>';
    return card;
  }

  function wrapRenderStream(){
    var dl = window.__v292 && window.__v292.dialogueLayout;
    if (!dl || typeof dl.renderStream !== 'function'){
      setTimeout(wrapRenderStream, 300);
      return;
    }
    if (dl.__v292Dfix56Wrapped) return;

    var origRender = dl.renderStream;
    var origExtract = dl.extractDialogues;

    dl.renderStream = function v292Dfix56RenderStream(){
      // 1) まず既存の renderStream を実行 (SAY hero カード + extract)
      try { origRender(); } catch(e){ console.warn(TAG, 'orig renderStream err:', e && e.message); }

      // 2) DO/STORY のユーザー入力を可視化するため、stream 内のカードを turn 順で
      //    走査して、各 DO/STORY turn の playerText カードが無ければ補完挿入する。
      try {
        var stream = document.getElementById('dialogue-stream');
        if (!stream) return;
        var st = (window.S && window.S.turns) ? window.S :
                 (function(){ try { return JSON.parse(localStorage.getItem('chr6') || '{}'); } catch(e){ return {}; }})();
        var turns = (st && st.turns) || [];
        var hero = (st && st.cast && st.cast.hero && st.cast.hero.name) ? st.cast.hero.name : '主人公';

        // 既存カードに付与した turn-index で重複防止する
        // (initial render では空、以降の render では同じ stream を innerHTML='' で
        //  クリアしてから再構築するので毎回新規)
        // 簡易: stream 末尾に「ユーザー入力カードがあるか」を turn ごとに判定して
        //       無ければ append。あれば skip。
        //
        // 実装: stream を上から走査し、各 turn の playerText の出現を確認していく。
        //       原 renderStream は turn 順で append するので、stream 内の順序と
        //       turn 順は一致する。turn[i] の DO/STORY カードが、turn[i] が
        //       生成した cards 区間内にあれば OK、なければ末尾に追加 (正確に
        //       挿入するのは難しいので末尾でも構わない)。
        //
        // ただし最も安全なのは: 全 DO/STORY turn の playerText カードが
        // stream 末尾までで欠けているなら追加する、というシンプルな実装。

        var existingTexts = Object.create(null);
        var cards = stream.querySelectorAll('.dlg-text');
        for (var ci = 0; ci < cards.length; ci++){
          existingTexts[cards[ci].textContent] = true;
        }

        for (var ti = 0; ti < turns.length; ti++){
          var t = turns[ti];
          if (!t || !t.playerText) continue;
          if (t.inputType !== 'DO' && t.inputType !== 'STORY') continue;
          if (existingTexts[t.playerText]) continue;
          var card = buildUserInputCard(t, hero);
          if (card) stream.appendChild(card);
        }
        stream.scrollTop = stream.scrollHeight;
      } catch(e){
        console.warn(TAG, 'enhance renderStream err:', e && e.message);
      }
    };

    dl.__v292Dfix56Wrapped = true;
    console.log(TAG, 'renderStream wrapped (DO/STORY user input cards)');

    // 即時 1 回 re-render
    try { dl.renderStream(); } catch(e){}
  }

  // ---------- (4) GM badge near mode buttons ----------
  function ensureGmBadge(){
    var btnBar = document.querySelector('.mdbtn') && document.querySelector('.mdbtn').parentNode;
    if (!btnBar) return;
    var existing = btnBar.querySelector('.v292Dfix56-gm-badge');
    if (!isGm()){
      if (existing) existing.remove();
      return;
    }
    if (existing) return;
    var badge = document.createElement('span');
    badge.className = 'v292Dfix56-gm-badge';
    badge.style.cssText =
      'display:inline-flex;align-items:center;gap:4px;'
      + 'margin-left:10px;padding:3px 10px;border-radius:12px;'
      + 'font-size:11px;font-weight:600;'
      + 'background:linear-gradient(135deg,rgba(196,144,64,.22),rgba(90,142,240,.22));'
      + 'color:var(--story,#c49040);'
      + 'border:1px solid rgba(196,144,64,.35);'
      + 'cursor:help';
    badge.textContent = '🎮 GM';
    badge.title = 'GMモード ON: 主人公の発話/行動は SAY/DO 入力時のみ反映されます\n'
                + '設定パネルから auto に切り替えると AI が主人公も動かします';
    btnBar.appendChild(badge);
  }

  function watchGmBadge(){
    // 設定変更でモードが切り替わったら badge を更新
    // localStorage 直接 watch はできないので、Chr6GmMode.set を wrap
    try {
      if (window.Chr6GmMode && typeof window.Chr6GmMode.set === 'function'
          && !window.Chr6GmMode.__v292Dfix56WrappedSet){
        var origSet = window.Chr6GmMode.set;
        window.Chr6GmMode.set = function(v){
          var r = origSet.call(this, v);
          try { ensureGmBadge(); } catch(e){}
          try { applyModeAwarePlaceholder(); } catch(e){}
          return r;
        };
        window.Chr6GmMode.__v292Dfix56WrappedSet = true;
        console.log(TAG, 'Chr6GmMode.set wrapped (badge + placeholder refresh)');
      }
    } catch(e){}
  }

  // ---------- boot ----------
  function boot(){
    // (1) disconnect fix55 MO + (2) install our mode-aware
    var inp = replaceInpToDisconnectMOs();
    if (inp) applyModeAwarePlaceholder();

    // wrap G.setMode
    wrapSetMode();
    // mdbtn class watch (safety net)
    watchModeButtons();
    // dialogue stream
    wrapRenderStream();
    // badge
    ensureGmBadge();
    watchGmBadge();
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  // 後発の boot (fix55 の retries が 1500/4000/9000ms にある — それより少し後に走らせる)
  setTimeout(boot, 800);
  setTimeout(boot, 2000);
  setTimeout(boot, 5000);
  setTimeout(boot, 10000);

  // ---------- Public API ----------
  window.__v292Dfix56 = {
    applyPlaceholder: applyModeAwarePlaceholder,
    rebuildBadge: ensureGmBadge,
    rerender: function(){
      try {
        var dl = window.__v292 && window.__v292.dialogueLayout;
        if (dl && typeof dl.renderStream === 'function') dl.renderStream();
      } catch(e){}
    },
    currentMode: currentInputMode,
    isGm: isGm
  };

  console.log(TAG, 'loaded — isGm:', isGm(), 'currentMode:', currentInputMode());
})();
