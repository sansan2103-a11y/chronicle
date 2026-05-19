// =====================================================================
// Chronicle TRPG - v292Dfix66: render-hook based repair
// ---------------------------------------------------------------------
// 症状 (実機 iPhone, ?cb=v292Dfix65b):
//   - 会話ログにカードが累積しない。各ターン送信ごとに直近1ターン分
//     しか表示されず、過去ターンの dialogue カードが消える。
//
// 確定したルート原因 (fix54-65 の 5重 wrap cascade 解析結果):
//   features.js の IIFE-local renderStreamV15 (line ~3779) は IIFE-local
//   raw extractDialoguesEnhanced を closure 直参照で呼ぶ。
//   UI._renderHooks に push されたフック (dialogueLayoutHookV15) も
//   IIFE-local renderStreamV15 を closure 直参照する。
//
//   この renderStreamV15 は毎ターン:
//     1. stream.innerHTML = '' で会話ログを完全クリア
//     2. 全 turns を raw extractor で再構築
//   raw extractor は <say> タグ非対応 + 内側マッチで取りこぼし多数のため
//   結果として「直近1ターン分の少数のカードしか残らない」状態になる。
//
//   v292Dfix64 は __v292.dialogueLayout.renderStream を wrap して
//   post-render repair を仕込んだが、hook は dl.renderStream を呼ばず
//   IIFE-local renderStreamV15 を直接呼ぶため、fix64 wrap は dead code。
//   (fix65 init で呼ばれる 1 回分の repair しか効かない)
//
// 修正方針 (独立 IIFE, render-hook based repair):
//   (A) UI._renderHooks の末尾に独自フックを push
//       features.js の dialogueLayoutHookV15 が動いた直後に必ず走る
//   (B) フック内では window.__v292Dfix66.repair を live binding で呼ぶ
//       (再注入や hot-patch で stale closure にならない)
//   (C) repair: 全 turns を回し、preprocess (<say> -> 「」) →
//       dl.extractDialogues (fix65-wrapped) で抽出 → 既存カードと diff →
//       欠落分のみ append
//   (D) dedup は (speaker|text) のみ。bare-key は廃止
//       (誤って NPC 発話が hero text と衝突した場合の取りこぼし防止)
//   (E) SAY echo 判定は hero speaker のみに限定
//       (NPC が偶然 player text と一致した場合の誤除外を防ぐ)
//   (F) setInterval(selfHeal, 2000) で末尾位置維持
//       (他フィーチャが後から push しても末尾を保ち、必ず features.js
//        の clear/re-render の後に動く)
//
// 互換性:
//   - v292Dfix50..65 は触らない (純追加 hook + 独立 IIFE)
//   - flag: window.__v292Dfix66Active
//   - export: window.__v292Dfix66 = { repair, preprocessNarrative,
//                                       lookupAvatar }
// =====================================================================
(function v292Dfix66(){
  'use strict';
  if (window.__v292Dfix66Active) return;
  window.__v292Dfix66Active = true;

  var TAG = '[v292Dfix66:renderhook-repair]';

  // ---------- helpers ----------
  function escHtml(s){
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getState(){
    // 1) IIFE-local S が window 経由で見えれば使う (旧パッチで漏らしたケース)
    try {
      if (window.S && window.S.turns) return window.S;
    } catch(e){}
    // 2) features.js IIFE-local S は外から見えないので LS fallback
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

  // ---------- preprocess: <say> タグ -> X「text」 ----------
  function preprocessNarrative(narr){
    if (!narr) return '';
    var s = Array.isArray(narr) ? narr.join('\n') : String(narr);

    function isInnerMonologue(t){
      return /^\s*[\(（][^\)）]*[\)）]\s*$/.test(t);
    }

    // 完全な <say who="X">text</say>
    s = s.replace(
      /<say\s+who="([^"]*)"\s*>([\s\S]*?)<\/say>/g,
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

    // alpha-strip 後の corrupted 形: <  ="X">text</> / < ="X">text</>
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

    // 余分な < ...> / </> 残骸を除去
    s = s.replace(/<\s*\/?\s*>/g, '');
    s = s.replace(/<say[^>]*>/g, '');
    s = s.replace(/<\/say>/g, '');

    return s;
  }

  // ---------- avatar lookup (fix62 と協調) ----------
  function lookupAvatar(name){
    if (!name) return '';
    try {
      if (window.__v292 && window.__v292.dfix15 &&
          typeof window.__v292.dfix15.getAvatar === 'function'){
        var v = window.__v292.dfix15.getAvatar(name);
        if (v) return v;
      }
    } catch(e){}
    try {
      var st = getState();
      if (st && st.cast){
        if (st.cast.hero && st.cast.hero.name === name && st.cast.hero.avatar){
          return st.cast.hero.avatar;
        }
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
    card.className = 'v292-dlg-card' + (isHeroFlag ? ' hero-card' : '') +
                     ' v292Dfix66-restored';
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

  // 既存 stream 内のカードを (speaker|text) のみで集計
  // (bare-key '|text' は廃止: NPC text と hero text 衝突時の取りこぼし防止)
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
      }
    }
    return set;
  }

  // turn から全 dialogue を抽出 (preprocess → dl.extractDialogues = fix65-wrapped)
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
      try { console.warn(TAG, 'extract err on turn:', e && e.message); } catch(_){}
    }
    return out;
  }

  // SAY echo: hero speaker のみに限定
  // (NPC 発話が偶然 player text と一致した場合の誤除外を防ぐ)
  function isSayEcho(turn, d, hero){
    if (!turn || turn.inputType !== 'SAY' || !turn.playerText || !d || !d.text){
      return false;
    }
    if (!d.speaker || d.speaker !== hero) return false;
    return String(turn.playerText).trim() === String(d.text).trim();
  }

  // ---------- main: render-hook repair ----------
  function repair(){
    try {
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
          if (isSayEcho(t, d, hero)) continue;
          var k = dialogueKey(d.speaker, d.text);
          if (existing[k]) continue;
          var isHeroFlag = !!d.isHero || (d.speaker && d.speaker === hero);
          var card = buildCard(d.speaker, d.text, isHeroFlag);
          stream.appendChild(card);
          existing[k] = true;
          added++;
        }
      }
      if (added > 0){
        stream.scrollTop = stream.scrollHeight;
        try { console.log(TAG, 'repaired', added, 'dialogue cards'); } catch(_){}
      }
      return added;
    } catch(e){
      try { console.warn(TAG, 'repair err:', e && e.message); } catch(_){}
      return 0;
    }
  }

  // ---------- public API (live binding for hot-swap) ----------
  window.__v292Dfix66 = {
    repair: repair,
    preprocessNarrative: preprocessNarrative,
    lookupAvatar: lookupAvatar
  };

  // Manual re-trigger shortcut
  window.regenerateConvLogV66 = function(){ return repair(); };

  // ---------- render hook (uses live binding) ----------
  // フック内で window.__v292Dfix66.repair を呼ぶ -> 再注入時も最新版を使う
  function v292Dfix66RenderHook(){
    try {
      var ns = window.__v292Dfix66;
      var fn = ns && ns.repair;
      if (typeof fn === 'function') fn();
    } catch(e){}
  }
  v292Dfix66RenderHook.__v292Dfix66 = true;

  function getUIRef(){
    try {
      if (typeof window.UI !== 'undefined' && window.UI) return window.UI;
      // eval to access non-window-bound UI (features.js exposes UI to global)
      var u = (0, eval)('typeof UI !== "undefined" ? UI : null');
      return u;
    } catch(e){ return null; }
  }

  function installHook(){
    try {
      var UI = getUIRef();
      if (!UI || !Array.isArray(UI._renderHooks)){
        setTimeout(installHook, 200);
        return false;
      }
      var hooks = UI._renderHooks;
      // Remove any previous instance, then push at the end so we run last
      var idx = -1;
      for (var i = 0; i < hooks.length; i++){
        if (hooks[i] && hooks[i].__v292Dfix66){ idx = i; break; }
      }
      if (idx >= 0) hooks.splice(idx, 1);
      hooks.push(v292Dfix66RenderHook);
      try { console.log(TAG, 'render hook installed at idx', hooks.length - 1); } catch(_){}
      // Initial repair (don't wait for next turn)
      try { v292Dfix66RenderHook(); } catch(e){}
      return true;
    } catch(e){
      setTimeout(installHook, 300);
      return false;
    }
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', installHook);
  } else {
    installHook();
  }
  // 後発フィーチャが UI._renderHooks を遅延 install するパターン対応
  setTimeout(installHook, 400);
  setTimeout(installHook, 1500);
  setTimeout(installHook, 4000);

  // ---------- selfHeal: ensure our hook stays at the end ----------
  // 他フィーチャが後から push しても末尾位置を維持し、
  // features.js の clear/re-render の後に必ず動くようにする
  setInterval(function selfHeal(){
    try {
      var UI = getUIRef();
      if (!UI || !Array.isArray(UI._renderHooks)) return;
      var hooks = UI._renderHooks;
      var idx = -1;
      for (var i = 0; i < hooks.length; i++){
        if (hooks[i] && hooks[i].__v292Dfix66){ idx = i; break; }
      }
      if (idx === -1){
        hooks.push(v292Dfix66RenderHook);
        return;
      }
      if (idx !== hooks.length - 1){
        hooks.splice(idx, 1);
        hooks.push(v292Dfix66RenderHook);
      }
    } catch(e){}
  }, 2000);

  try { console.log(TAG, 'loaded'); } catch(_){}
})();
