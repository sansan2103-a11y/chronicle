// =====================================================================
// Chronicle TRPG — v292Dfix64: conversation-log restore (post-render repair)
// ---------------------------------------------------------------------
// 症状 (実機 iPhone, ?cb=v292Dfix63):
//   - narrative パネル: 引用符付きの台詞が表示される
//     例「中でカエデは必死に抵抗しようとするが…『いやっ！誰！？離して！』
//        彼女の声は、恐怖に震えていた。」
//   - 会話ログパネル: 完全に空 (ヘッダーだけ)
//
// ライブ調査 (Chrome MCP, 同 cache-buster):
//   S.turns[0].narrative には Hermes の <say who="カエデ">いやっ…</say> タグが
//   そのまま残っており、UI.renderNarr (v292Dfix60 wrap) のみが表示時に「」へ
//   変換している。
//
// 確定したルート原因:
//   features.js IIFE 内 renderStreamV15 (line ~3779) は同 IIFE-local の
//   raw extractDialoguesEnhanced を closure 直参照で呼ぶ:
//     var ds = extractDialoguesEnhanced(t.narrative, t);
//   一方 v292Dfix59 (hybrid extractor) は __v292.dialogueLayout.extractDialogues
//   を wrap して <say> タグ抽出をサポートしているが、renderStreamV15 は
//   その wrap を通さない。結果:
//     dl.extractDialogues(narr, t) → [{カエデ, いやっ…, source:v292Dfix59-tag}]  ✓
//     dl.renderStream()           → 0 dialogue cards (raw extractor は <say> 非対応)
//
//   v292Dfix56 input-card 補完も window.S が undefined なため LS fallback で
//   走るが、肝心の NPC 発話カードは1枚も追加されない。
//
// 修正方針 (独立 IIFE, post-render 修復):
//   (A) dl.renderStream を wrap し、orig 実行後に修復パスを 1 回走らせる
//   (B) 修復パスは window.S → LS の順で状態取得 (features.js IIFE-local S は
//       外部からは見えないため LS 優先で十分; window.S が将来公開された場合も
//       同じ key で merge する)
//   (C) 各 turn.narrative を preprocess:
//         <say who="X">text</say>              → X「text」
//         < ="X">text</>      (alpha-stripped) → X「text」
//       これで raw extractor の Pattern B が動く。
//   (D) dl.extractDialogues (=fix59-wrapped) を preprocess 後の narrative に対し
//       呼び、`<say>` タグ抽出 + 既存パターン抽出をマージ
//   (E) 既存 DOM カードを (speaker|text) と (|text) で集計し、欠落分のみ
//       appendChild する。重複生成しない。
//   (F) fix62 の MO が新しく追加された .dlg-av を自動で repair してくれるので、
//       avatar は別途処理しない (lookup だけ済ませて img を埋め、fix62 と
//       競合しないよう dlg-av 内テキストは '?' のままに)
//
// 互換性:
//   - v292Dfix50..63 はいずれも触らない (純追加 wrap)
//   - flag: window.__v292Dfix64Active
//   - export: window.__v292Dfix64 = { repair, preprocessNarrative }
// =====================================================================
(function v292Dfix64(){
  'use strict';
  if (window.__v292Dfix64Active) return;
  window.__v292Dfix64Active = true;

  var TAG = '[v292Dfix64:conv-log-restore]';

  // ---------- helpers ----------
  function escHtml(s){
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getState(){
    // 1) IIFE-local S が window 経由で見えれば (旧パッチで漏らしたケース) 使う
    try {
      if (window.S && window.S.turns) return window.S;
    } catch(e){}
    // 2) features.js の IIFE-local S は外からは見えないので LS にフォールバック
    try {
      var raw = localStorage.getItem('chr6');
      if (raw){
        var parsed = JSON.parse(raw);
        if (parsed && parsed.turns) return parsed;
      }
    } catch(e){}
    return { turns: [], cast: {} };
  }

  function getHero(st){
    if (st && st.cast && st.cast.hero && st.cast.hero.name) return st.cast.hero.name;
    return '主人公';
  }

  // ---------- (C) preprocess: <say> タグ修復 ----------
  function preprocessNarrative(narr){
    if (!narr) return '';
    var s = Array.isArray(narr) ? narr.join('\n') : String(narr);

    // 内心モノローグ判定ヘルパ: 中身がすでに （…） で囲まれているか
    function isInnerMonologue(t){
      return /^\s*[\(（][^\)）]*[\)）]\s*$/.test(t);
    }

    // C-1: 完全な <say who="X">text</say>
    s = s.replace(
      /<say\s+who="([^"]*)"\s*>([\s\S]*?)<\/say>/g,
      function(_, who, content){
        var t = String(content || '').trim();
        var w = String(who || '').trim();
        if (!t) return '';
        if (isInnerMonologue(t)){
          // （…）はそのまま (extractor は内心台詞も拾えるよう「」化)
          return w ? (w + '「' + t + '」') : t;
        }
        return w ? (w + '「' + t + '」') : ('「' + t + '」');
      }
    );

    // C-2: alpha-strip 後の corrupted 形:
    //      <  ="X">text</>   (say/who の英字が削除された)
    //      < ="X">text</>    (1スペース版)
    s = s.replace(
      /<\s*="([^"]*)"\s*>([\s\S]*?)<\s*\/\s*>/g,
      function(_, who, content){
        var t = String(content || '').trim();
        var w = String(who || '').trim();
        if (!t) return '';
        if (isInnerMonologue(t)){
          return w ? (w + '「' + t + '」') : t;
        }
        return w ? (w + '「' + t + '」') : ('「' + t + '」');
      }
    );

    // C-3: もう少し緩い corrupted 形 (属性順や引用符ぶれ):
    //      < something="X"> text </ something>
    //      これは say/who に対応する代表的な corrupted パターンのみ網羅
    s = s.replace(
      /<\s+="([^"]*)"\s*>([\s\S]*?)<\/\s+>/g,
      function(_, who, content){
        var t = String(content || '').trim();
        var w = String(who || '').trim();
        if (!t) return '';
        if (isInnerMonologue(t)){
          return w ? (w + '「' + t + '」') : t;
        }
        return w ? (w + '「' + t + '」') : ('「' + t + '」');
      }
    );

    // C-4: 余分な < ...> や </> の残骸を除去 (extractor がノイズで誤検出するの防止)
    s = s.replace(/<\s*\/?\s*>/g, '');
    // 開いた say tag が片方だけ残ってるケース (safety)
    s = s.replace(/<say[^>]*>/g, '');
    s = s.replace(/<\/say>/g, '');

    return s;
  }

  // ---------- avatar lookup (fix62 と協調; img を埋めず fix62 の MO に任せる) ----------
  function lookupAvatar(name){
    if (!name) return '';
    try {
      if (window.__v292 && window.__v292.dfix15 && typeof window.__v292.dfix15.getAvatar === 'function'){
        var v = window.__v292.dfix15.getAvatar(name);
        if (v) return v;
      }
    } catch(e){}
    try {
      var st = getState();
      if (st && st.cast){
        if (st.cast.hero && st.cast.hero.name === name && st.cast.hero.avatar) return st.cast.hero.avatar;
        var arr = st.cast.npcs || [];
        for (var i = 0; i < arr.length; i++){
          if (arr[i] && arr[i].name === name && arr[i].avatar) return arr[i].avatar;
        }
      }
    } catch(e){}
    return '';
  }

  function buildCard(speaker, text, isHeroFlag){
    var av = lookupAvatar(speaker);
    var avHtml = av
      ? '<img src="' + escHtml(av) + '" alt="' + escHtml(speaker) + '" loading="lazy"'
        + ' onerror="this.parentNode.textContent=String.fromCharCode(63)">'
      : '?';
    var card = document.createElement('div');
    card.className = 'v292-dlg-card' + (isHeroFlag ? ' hero-card' : '') + ' v292Dfix64-restored';
    card.innerHTML =
      '<div class="dlg-av">' + avHtml + '</div>'
      + '<div class="dlg-body">'
      +   '<div class="dlg-name">' + escHtml(speaker || '???') + '</div>'
      +   '<div class="dlg-text">' + escHtml(text) + '</div>'
      + '</div>';
    return card;
  }

  function dialogueKey(speaker, text){
    return (speaker || '') + '|' + (text || '');
  }

  // 既存 stream 内のカードを (speaker|text) と (|text) の両方で集計
  function collectExistingKeys(stream){
    var set = Object.create(null);
    var cards = stream.querySelectorAll('.v292-dlg-card');
    for (var i = 0; i < cards.length; i++){
      var c = cards[i];
      var nameEl = c.querySelector('.dlg-name');
      var textEl = c.querySelector('.dlg-text');
      if (!textEl) continue;
      var name = '';
      if (nameEl){
        // dfix56 input card は <span> バッジを含むので最初の text node のみ取る
        var fc = nameEl.firstChild;
        if (fc && fc.nodeType === 3){
          name = (fc.textContent || '').trim();
        }
        if (!name){
          name = (nameEl.textContent || '').trim().split(/\s|📖|⚔|💭|🎭|✨/)[0];
        }
      }
      var text = (textEl.textContent || '').trim();
      if (text){
        set[dialogueKey(name, text)] = true;
        set['|' + text] = true; // speakerless 一致防止
      }
    }
    return set;
  }

  // turn から全 dialogue を抽出 (preprocess → dl.extractDialogues)
  function extractFromTurn(turn){
    var narr = turn && turn.narrative;
    if (!narr) return [];
    var preprocessed = preprocessNarrative(narr);
    var out = [];
    var seen = Object.create(null);
    try {
      var dl = window.__v292 && window.__v292.dialogueLayout;
      if (dl && typeof dl.extractDialogues === 'function'){
        var ds = dl.extractDialogues(preprocessed, turn) || [];
        for (var i = 0; i < ds.length; i++){
          var d = ds[i];
          if (!d || !d.text) continue;
          var k = dialogueKey(d.speaker, d.text);
          if (seen[k]) continue;
          seen[k] = true;
          out.push(d);
        }
      }
    } catch(e){
      console.warn(TAG, 'extract err on turn:', e && e.message);
    }
    return out;
  }

  // SAY echo 抑制: SAY 入力 turn の場合、playerText と同一テキストの dialogue は
  // 既存 SAY hero カードと重複するので除外
  function isSayEcho(turn, d){
    if (!turn || turn.inputType !== 'SAY' || !turn.playerText || !d || !d.text) return false;
    return String(turn.playerText).trim() === String(d.text).trim();
  }

  // ---------- main: post-render repair ----------
  function repair(reason){
    var stream = document.getElementById('dialogue-stream');
    if (!stream) return 0;
    var st = getState();
    var turns = st.turns || [];
    if (!turns.length) return 0;
    var hero = getHero(st);
    var existing = collectExistingKeys(stream);
    var added = 0;
    for (var i = 0; i < turns.length; i++){
      var t = turns[i];
      if (!t) continue;
      var ds = extractFromTurn(t);
      for (var j = 0; j < ds.length; j++){
        var d = ds[j];
        if (isSayEcho(t, d)) continue;
        var k = dialogueKey(d.speaker, d.text);
        var kBare = '|' + d.text;
        if (existing[k] || existing[kBare]) continue;
        var isHero = !!d.isHero || (d.speaker && d.speaker === hero);
        var card = buildCard(d.speaker, d.text, isHero);
        stream.appendChild(card);
        existing[k] = true;
        existing[kBare] = true;
        added++;
      }
    }
    if (added > 0){
      stream.scrollTop = stream.scrollHeight;
      console.log(TAG, 'restored', added, 'dialogue cards (' + reason + ')');
    }
    return added;
  }

  // ---------- (A) renderStream wrap ----------
  function wrapRenderStream(){
    var dl = window.__v292 && window.__v292.dialogueLayout;
    if (!dl || typeof dl.renderStream !== 'function'){
      setTimeout(wrapRenderStream, 300);
      return;
    }
    if (dl.__v292Dfix64Wrapped) return;
    var orig = dl.renderStream;
    dl.renderStream = function v292Dfix64RenderStream(){
      try { orig.apply(this, arguments); }
      catch(e){ console.warn(TAG, 'orig renderStream err:', e && e.message); }
      try { repair('post-render'); }
      catch(e){ console.warn(TAG, 'repair err:', e && e.message); }
    };
    dl.__v292Dfix64Wrapped = true;
    console.log(TAG, 'dl.renderStream wrapped (conversation-log restore active)');

    // 既存 turns に対して 1 回 repair
    try { dl.renderStream(); }
    catch(e){ console.warn(TAG, 'initial render err:', e && e.message); }
  }

  // ---------- public API ----------
  window.__v292Dfix64 = {
    repair: repair,
    preprocessNarrative: preprocessNarrative,
    lookupAvatar: lookupAvatar
  };

  // 手動再走査用ショートカット
  window.regenerateConvLogV64 = function(){ return repair('manual'); };

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', wrapRenderStream);
  } else {
    wrapRenderStream();
  }
  // 後発の wrap (dl.dialogueLayout が遅延 install されるパターンに対応)
  setTimeout(wrapRenderStream, 400);
  setTimeout(wrapRenderStream, 1500);
  setTimeout(wrapRenderStream, 4000);

  console.log(TAG, 'loaded');
})();
