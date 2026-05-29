// =====================================================================
// Chronicle TRPG - v292Dfix66: render-hook based repair
// (fix103: non-cast avatar prompt → eerie/horror creature style + scene tone)
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

  // v292Dfix91: 会話ログのカードに、引用に隣接する地の文（動作・トーン）を
  // sub-text として添えるためのスタイル。--dim は有効な配色なので fallback 付きで使用。
  (function injectBeatStyle(){
    try {
      if (document.getElementById('v292Dfix91-beat-style')) return;
      var st = document.createElement('style');
      st.id = 'v292Dfix91-beat-style';
      st.textContent =
        '.v292-dlg-card .dlg-beat{font-size:12px;color:var(--dim,#6868a0);'
        + 'line-height:1.4;margin-top:3px;font-style:italic;opacity:.92;'
        + 'word-break:break-word}';
      (document.head || document.documentElement).appendChild(st);
    } catch(e){}
  })();

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

    // v292Dfix101: the model sometimes emits ESCAPED output (literal \n, \", \t)
    // that no upstream step un-escapes, so a real newline shows up as the text "\n"
    // and a tag as <say who=\"X\">. Un-escape first: this restores real newlines
    // (so the speaker resolvers' sentence-splitting on \n works again) AND turns
    // \"  into " so the <say who="X"> regex below can match & convert it.
    if (s.indexOf('\\') >= 0){
      s = s.replace(/\\r\\n/g, '\n').replace(/\\r/g, '\n').replace(/\\n/g, '\n')
           .replace(/\\t/g, ' ').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }

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

  // ---------- v292Dfix99: non-cast (entity) avatar auto-generation ----------
  // Cast avatars are Pollinations URLs (anime portrait of <appearance>, ... ?model=flux).
  // Non-cast speakers labeled by fix98 (人形/妖怪/モンスター/custom) have no avatar →
  // show '?'. Generate one for them too, from the appearance the PROSE gives at the
  // entity's first mention. Deterministic seed per name = same entity, same image,
  // stable across re-renders. In-memory cache; new story (turns cleared) = fresh.
  var NC_AVATARS = Object.create(null);   // name -> pollinations url
  var NC_NARR = '';                       // all-turns narrative, set by repair()
  function ncHash(s){
    var h = 0; s = String(s || '');
    for (var i = 0; i < s.length; i++){ h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
    return Math.abs(h);
  }
  // Pull the entity's appearance from its FIRST mention: the sentence containing the
  // name plus up to 2 following sentences (intros usually describe looks right after),
  // with any 「dialogue」 stripped so speech doesn't pollute the image prompt.
  // v292Dfix123: give the LLM a GENEROUS, stable context window so it can infer what the
  // entity IS (person / creature / spirit / object) and depict it faithfully — instead of
  // the old 1-3 sentence scrape forced into a "horror creature" template.
  function ncAppearance(name, narr){
    if (!name || !narr) return '';
    var pos = (name === '???' || name === '?') ? -1 : narr.indexOf(name);
    if (pos < 0){
      // unnamed / not found by name → best-effort: use the most recent narrative as context
      var tail = String(narr).slice(-450).replace(/<[^>]+>/g, ' ').replace(/[「『〝][^」』〟]*[」』〟]/g, ' ').replace(/\s+/g, ' ').trim();
      return tail.slice(-320);
    }
    var s1 = narr.lastIndexOf('。', pos), s2 = narr.lastIndexOf('\n', pos);
    var start = Math.max(s1, s2) + 1;
    var chunk = narr.slice(start, start + 400);
    var m = chunk.match(/^(?:[^。\n]*[。\n]){1,5}/);
    var appear = (m ? m[0] : chunk);
    appear = appear.replace(/<[^>]+>/g, ' ');                  // drop any tags
    appear = appear.replace(/[「『〝][^」』〟]*[」』〟]/g, ' ');  // drop quoted speech
    appear = appear.replace(/\s+/g, ' ').trim();
    if (appear.length > 300) appear = appear.slice(0, 300);
    return appear;
  }
  function ncBuildAvatar(name){
    if (!name) return '';   // v292Dfix123: allow '???'/unnamed too (best-effort from context)
    if (NC_AVATARS[name]) return NC_AVATARS[name];
    var appear = ncAppearance(name, NC_NARR);
    // v292Dfix103: non-cast entities are usually creatures/threats, not pretty cast
    // characters — the old "anime portrait of X, fantasy, high quality" wrapper made
    // 怪異/モンスター look cute. Use an eerie/menacing wrapper instead, and fold in the
    // scene's tone (e.g. 不気味) so the mood matches the story.
    var tone = '';
    try { var st = getState(); if (st && st.scene && st.scene.tone) tone = String(st.scene.tone).trim(); } catch(e){}
    var subject = appear ? (name + ', ' + appear) : (name + ', unknown ominous entity');
    var prompt = 'dark eerie horror creature art of ' + subject
               + (tone ? ', ' + tone : '')
               + ', ominous, sinister, unsettling, grim dark atmosphere, dramatic shadows, detailed';
    var seed = ncHash(name) % 1000000;
    var url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt)
            + '?width=384&height=384&seed=' + seed + '&nologo=true&model=flux';
    NC_AVATARS[name] = url;
    return url;
  }

  // ---------- avatar lookup (fix62 と協調) ----------
  // v292Dfix118: when the AI-avatar toggle is on, route the resolved URL through
  // window.__aiAvatar (LLM-written prompt, cached per name). Off/no-key → unchanged.
  function aiHook(name, url, desc){
    try { if (url && window.__aiAvatar && window.__aiAvatar.enabled && window.__aiAvatar.enabled()) return window.__aiAvatar.urlFor(name, url, desc || ''); } catch(e){}
    return url;
  }
  // v292Dfix120: resolve a character's description (gender/appearance/role) for the
  // AI-avatar prompt. Without this, the dfix15 cache branch passed an EMPTY desc and
  // the LLM invented a mismatched look (おしん: "アイコンが設定とあってない").
  function castDescFor(name){
    try {
      var st = getState();
      if (st && st.cast){
        if (st.cast.hero && st.cast.hero.name === name) return st.cast.hero.desc || '';
        var arr = st.cast.npcs || [];
        for (var i = 0; i < arr.length; i++){ if (arr[i] && arr[i].name === name) return arr[i].desc || ''; }
      }
    } catch(e){}
    return '';
  }
  function lookupAvatar(name){
    if (!name) return '';
    try {
      if (window.__v292 && window.__v292.dfix15 &&
          typeof window.__v292.dfix15.getAvatar === 'function'){
        var v = window.__v292.dfix15.getAvatar(name);
        if (v) return aiHook(name, v, castDescFor(name) || ncAppearance(name, NC_NARR));
      }
    } catch(e){}
    try {
      var st = getState();
      if (st && st.cast){
        if (st.cast.hero && st.cast.hero.name === name && st.cast.hero.avatar){
          return aiHook(name, st.cast.hero.avatar, st.cast.hero.desc);
        }
        var arr = st.cast.npcs || [];
        for (var i = 0; i < arr.length; i++){
          if (arr[i] && arr[i].name === name && arr[i].avatar) return aiHook(name, arr[i].avatar, arr[i].desc);
        }
      }
    } catch(e){}
    // v292Dfix99: not a cast member → auto-generate an avatar from the prose
    try {
      var nc = ncBuildAvatar(name);
      if (nc) return aiHook(name, nc, ncAppearance(name, NC_NARR));
    } catch(e){}
    return '';
  }

  function buildCard(speaker, text, isHeroFlag){
    var av = lookupAvatar(speaker);
    var avHtml = av
      ? '<img src="' + escHtml(av) + '" alt="' + escHtml(speaker) + '" loading="lazy"'
        + ' onerror="if(this.parentNode)this.parentNode.textContent=String.fromCharCode(63)">'
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

  // ---------- v292Dfix102: upgrade stale / cold-start "?" avatars ----------
  // repair() only ADDS new cards; it never rebuilds existing ones. So a card rendered
  // before fix99 (no avatar) — or one whose Pollinations image failed on first load
  // during cold-start (30-40s), tripping onerror → "?" — stays "?" forever. This walks
  // existing "?" cards and, if lookupAvatar now yields a URL, re-inserts a fresh <img>
  // (the same path a fresh build uses, so fix86 converts it to a blob). Re-runs via the
  // bounded delayed repair() calls below, so a cold image is retried until it warms up.
  function nameOfCard(card){
    var nameEl = card.querySelector('.dlg-name');
    if (!nameEl) return '';
    var fc = nameEl.firstChild;
    var name = (fc && fc.nodeType === 3) ? (fc.textContent || '').trim() : '';
    if (!name) name = (nameEl.textContent || '').trim().split(/\s|📖|⚔|💭|🎭|✨/)[0];
    return name;
  }
  function upgradeMissingAvatars(stream){
    try {
      if (!stream) return;
      if (!NC_NARR){
        try { var st = getState(); var ts = (st && st.turns) || []; var a = '';
          for (var k = 0; k < ts.length; k++){ if (ts[k]) a += '\n' + preprocessNarrative(ts[k].narrative); }
          NC_NARR = a; } catch(e){}
      }
      var cards = stream.querySelectorAll('.v292-dlg-card');
      for (var i = 0; i < cards.length; i++){
        var card = cards[i];
        var av = card.querySelector('.dlg-av');
        if (!av || av.querySelector('img')) continue;     // already has an image
        var name = nameOfCard(card);
        if (!name || name === '???') continue;
        var url = lookupAvatar(name);
        if (url){
          // v292Dfix109: cache-bust each retry so a transient Pollinations 402
          // (rate-limit) isn't reused from cache — forces a genuinely fresh
          // request. The image's seed stays in the URL so content is identical;
          // Pollinations ignores the extra _r param.
          var fresh = url + (url.indexOf('?') > -1 ? '&' : '?') + '_r=' + Date.now();
          av.innerHTML = '<img src="' + escHtml(fresh) + '" alt="' + escHtml(name) + '" loading="lazy"'
            + ' onerror="if(this.parentNode)this.parentNode.textContent=String.fromCharCode(63)">';
        }
      }
    } catch(e){}
  }

  // v292Dfix110: the same line often recurs across turns and gets resolved with
  // slightly different speaker labels — a resolver name-doubling glitch
  // ("人体模型は人体模型") or an inner-monologue suffix ("マリア(心)"). The exact
  // (speaker|text) dedup then misses them and the SAME line shows twice.
  // cleanSpeakerName fixes the doubling for DISPLAY; dedupSpeaker further drops
  // the (心) suffix for the dedup KEY only, so spoken+inner of one line collapse.
  function cleanSpeakerName(s){
    s = (s || '').trim();
    var m = s.match(/^(.+?)(?:は|が|も|と)\1$/);   // "AはA" / "AがA" ... -> "A"
    if (m) s = m[1];
    return s;
  }
  function dedupSpeaker(s){
    return cleanSpeakerName(s).replace(/[（(]\s*心\s*[）)]$/, '').trim();
  }
  function dialogueKey(speaker, text){
    return dedupSpeaker(speaker) + '|' + (text || '');
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

  // v292Dfix89: a 「quote」 immediately followed by these is a citation/concept,
  // not speech (e.g. 「襲われた」という事実). Used to drop non-dialogue from the log.
  function isNonSpeechQuote(narr, text){
    if (!text || !narr) return false;
    var QO = '「『〝', QC = '」』〟';
    for (var o = 0; o < QO.length; o++){
      for (var c = 0; c < QC.length; c++){
        var needle = QO.charAt(o) + text + QC.charAt(c);
        var idx = narr.indexOf(needle);
        if (idx !== -1){
          var after = narr.slice(idx + needle.length, idx + needle.length + 10);
          return /^(?:という(?:事実|言葉|もの|こと|名前?|概念|感覚|感じ|気持ち|思い|考え|意味|響き|噂|話|風|点|わけ|の)|といった(?:もの|こと)|のような|のように|みたいな|みたいに|的な)/.test(after);
        }
      }
    }
    return false;
  }

  // ---------- v292Dfix91: dialogue beat (会話ログに地の文の動作/トーンを添える) ----------
  // 引用に隣接する地の文（動作・表情・トーン）を1文抜き出して sub-text にする。
  // narrative 本体に書かれた "reaction" を会話ログにも反映し、bare quote だけの薄さを解消。
  // 発話の実体は地の文に書かれるが、<say>/「」は独立行になりがちで、動作プロセは
  // 隣の行にある。よって「引用の直後(次行)のプロセを次の引用/タグまで跨いで拾い、
  // 無ければ直前のプロセ」を beat とし、最初の1文に整える。
  function findBeat(narr, speaker, text){
    if (!narr || !text) return '';
    var QO = '「『〝', QC = '」』〟';
    var idx = -1, needleLen = 0;
    for (var o = 0; o < QO.length && idx === -1; o++){
      for (var c = 0; c < QC.length && idx === -1; c++){
        var needle = QO.charAt(o) + text + QC.charAt(c);
        var pp = narr.indexOf(needle);
        if (pp !== -1){ idx = pp; needleLen = needle.length; }
      }
    }
    if (idx === -1) return '';
    // 残存タグ・引用スパン・話者名を除去し、前後の余分な記号を整える
    function clean(str){
      if (!str) return '';
      var b = str.replace(/<\/?[^>]*>/g, '').replace(/[「『〝][^「」『』〝〟]*[」』〟]/g, '');
      if (speaker){
        var sp = String(speaker).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        b = b.replace(new RegExp(sp + '(?:は|が|の|も|に|へ|と|を|、)?', 'g'), '');
      }
      return b.replace(/\s+/g, '')
              .replace(/^[、。，,・…ー—\-]+/, '')
              .replace(/[、，]+$/, '')
              .trim();
    }
    // 引用の直後(次行のプロセ)を、次の引用/タグまで跨いで拾う
    function fwd(from){
      var s = narr.slice(from, from + 140);
      var m = s.search(/[「『〝]|<say|<\s*="/);
      return m !== -1 ? s.slice(0, m) : s;
    }
    // 直前のプロセ(前の引用/タグ以降)を拾う
    function bwd(from){
      var s = narr.slice(Math.max(0, from - 140), from);
      var last = -1, mm, re = /[」』〟]|<\/say>|<\s*\/\s*>/g;
      while ((mm = re.exec(s))) last = mm.index + mm[0].length;
      return last !== -1 ? s.slice(last) : s;
    }
    var beat = clean(fwd(idx + needleLen));        // 発話の「後」の反応プロセを優先
    if (beat.length < 2) beat = clean(bwd(idx));   // 無ければ「前」のプロセ
    if (beat.length < 2) return '';
    // 最初の文(。！？)で切って1文の beat にする
    var re2 = /[。！？]/g, m2, cut = -1;
    while ((m2 = re2.exec(beat))){ if (m2.index + 1 >= 10){ cut = m2.index + 1; break; } cut = m2.index + 1; }
    if (cut !== -1 && cut >= 6) beat = beat.slice(0, cut);
    if (beat.length > 42) beat = beat.slice(0, 42) + '…';
    return beat;
  }

  // 全カードに beat を後付け（base レンダラー由来も fix66 追記分も一律に処理）。
  // data-beat-checked で再処理を防ぐ（selfHeal 2s ループでの flicker/重複を回避）。
  function enhanceBeats(stream, allNarr){
    if (!stream || !allNarr) return;
    try {
      var cards = stream.querySelectorAll('.v292-dlg-card');
      for (var i = 0; i < cards.length; i++){
        var c = cards[i];
        if (c.getAttribute('data-beat-checked')) continue;
        var nameEl = c.querySelector('.dlg-name');
        var textEl = c.querySelector('.dlg-text');
        var bodyEl = c.querySelector('.dlg-body');
        if (!textEl || !bodyEl) continue;
        // 展開/入力バッジカード（📖 等）は対象外
        if (nameEl && /📖|⚔|💭|🎭|✨|展開/.test(nameEl.textContent || '')){
          c.setAttribute('data-beat-checked', '1'); continue;
        }
        if (c.querySelector('.dlg-beat')){ c.setAttribute('data-beat-checked', '1'); continue; }
        var nm = '';
        if (nameEl){
          var fc = nameEl.firstChild;
          if (fc && fc.nodeType === 3) nm = (fc.textContent || '').trim();
          if (!nm) nm = (nameEl.textContent || '').trim().split(/\s|📖|⚔|💭|🎭|✨/)[0];
        }
        if (nm === '???') nm = '';
        var tx = (textEl.textContent || '').trim();
        c.setAttribute('data-beat-checked', '1');
        if (!tx) continue;
        var beat = findBeat(allNarr, nm, tx);
        if (beat){
          var bd = document.createElement('div');
          bd.className = 'dlg-beat';
          bd.textContent = beat;
          bodyEl.appendChild(bd);
        }
      }
    } catch(e){
      try { console.warn(TAG, 'enhanceBeats err:', e && e.message); } catch(_){}
    }
  }

  // turn から全 dialogue を抽出 (preprocess → dl.extractDialogues = fix65-wrapped)
  // ---------- v292Dfix97: post-quote speaker attribution ----------
  // Resolve "???" speakers when the name follows the quote, e.g.
  //   「ひ——っ……！？」と、フィーネの喉が裂けるような短い悲鳴が割って入った。
  // The base extractor only catches names BEFORE the quote / <say who>, so a
  // post-positioned attribution leaves speaker="" → shown as "???". Here we read
  // the prose right after the quote and, if it is a quotative「と …<cast name>…
  // <speech/voice word>」construction, assign that cast member. Only CURRENT cast
  // names are candidates and a speech word is required, so a listener/bystander
  // mentioned after the line is not mis-attributed.
  function castNameList(){
    var out = [];
    try {
      var st = getState();
      if (st && st.cast){
        if (st.cast.hero && st.cast.hero.name) out.push(String(st.cast.hero.name).trim());
        if (Array.isArray(st.cast.npcs)) st.cast.npcs.forEach(function(n){ if (n && n.name) out.push(String(n.name).trim()); });
      }
    } catch(e){}
    // longest first so e.g. "アカネ" wins over a substring
    return out.filter(Boolean).sort(function(a,b){ return b.length - a.length; });
  }
  var SPEECH_WORD_RX = /(悲鳴|絶叫|叫|声|呻|うめ|呟|つぶや|囁|ささや|喚|わめ|喘|あえ|啜|嗚咽|呼|言|吐|漏らし|上げ|応じ|返し|続け|呟き)/;
  function resolvePostQuoteSpeaker(narr, text, names){
    if (!narr || !text || !names || !names.length) return '';
    var idx = narr.indexOf('「' + text + '」');
    if (idx >= 0){ idx += text.length + 2; }
    else { idx = narr.indexOf(text); if (idx < 0) return ''; idx += text.length; }
    var tail = narr.slice(idx, idx + 60);
    var stop = tail.search(/[「。\n]/);
    if (stop >= 0) tail = tail.slice(0, stop);
    if (!/^\s*[とっ、]*と/.test(tail)) return '';   // require quotative と right after the quote
    if (!SPEECH_WORD_RX.test(tail)) return '';        // require a speech/voice word
    for (var i = 0; i < names.length; i++){ if (tail.indexOf(names[i]) >= 0) return names[i]; }
    return '';
  }

  // ---------- v292Dfix98: non-cast (entity) speaker, from the name the prose gives ----------
  // Generalises fix97 to NON-cast speakers WITHOUT a fixed keyword list: use whatever
  // name the narrative attributes the line to (妖怪/モンスター/怪異/独自名…). Only OVERRIDES
  // the base extractor's (proximity) guess; never touches a clearly-cast line.
  //   A) 「…」と <X>(は|が) …<speech verb>   where X is not a cast member → label X
  //   B) 「…」と …(息遣い/噛む音/呼吸…) with no name → preceding sentence's non-cast subject
  var DFX98_SPEECH = /(言|叫|呟|呻|囁|唸|怒鳴|喚|吠|咆|嘶|喉|告げ|呼ん|笑|吐き捨|吐き出|応じ|返し|続け|問|答|きゃ|悲鳴|絶叫|うめ|喘|怒号|わめ|吼)/;
  var DFX98_SOUND  = /(息遣い|吐息|鼻息|寝息|呼吸|噛む音|咀嚼|啜|立てる音|立てた音|物音|呼気)/;
  function resolveNonCastSpeaker(narr, text, names){
    if (!narr || !text || !names || !names.length) return '';
    function isCastName(x){ for (var i = 0; i < names.length; i++){ if (x === names[i] || x.indexOf(names[i]) >= 0 || names[i].indexOf(x) >= 0) return true; } return false; }
    var qi = narr.indexOf('「' + text + '」'), qOpen, after;
    if (qi >= 0){ qOpen = qi; after = qi + text.length + 2; }
    else { var ti = narr.indexOf(text); if (ti < 0) return ''; qOpen = ti; after = ti + text.length; }
    var pre = narr.slice(Math.max(0, qOpen - 8), qOpen);
    for (var p = 0; p < names.length; p++){ if (pre.indexOf(names[p]) >= 0) return ''; } // cast pre-name → keep
    var tail = narr.slice(after, after + 50);
    var ts = tail.search(/[「。\n]/); if (ts >= 0) tail = tail.slice(0, ts);
    for (var c = 0; c < names.length; c++){ if (tail.indexOf(names[c]) >= 0) return ''; } // cast in tail → keep
    // A) と<X>(は|が)…<speech verb>, X not cast
    if (/^\s*[、っ]*と/.test(tail) && DFX98_SPEECH.test(tail)){
      var mA = tail.match(/^[、\s]*と[、\s]*([^、。\s「」はがをにへとのも]{1,12})(?:は|が)/);
      if (mA && !isCastName(mA[1]) && mA[1].length >= 2) return mA[1];
    }
    // B) sound attribution with no name → preceding sentence's non-cast subject
    if (DFX98_SOUND.test(tail)){
      var before = narr.slice(0, qOpen);
      var segs = before.split(/[。\n]/), prev = '';
      for (var s = segs.length - 1; s >= 0; s--){ if (segs[s].trim()){ prev = segs[s].trim(); break; } }
      var mB = prev.match(/([^、。\s「」はがをにへとのも]{2,12})(?:は|が)/);
      if (mB && !isCastName(mB[1])) return mB[1];
    }
    return '';
  }

  // ---------- v292Dfix100: pre-positioned speaker (name BEFORE the quote) ----------
  // fix97 = name AFTER quote (「…」と◯◯が); fix98 = と<X>が / sound attribution.
  // This covers the remaining ??? form: "◯◯は…(発話動詞)。 「…」" where the speaker is
  // the subject of the sentence right before the quote (e.g. 怪異は…独り言を漏らしている。
  // 「…お前も…」). FILLS empty speakers only — never overrides an existing attribution —
  // so it can only improve ??? cards. Works for cast and non-cast; non-cast names then
  // get an auto avatar via fix99.
  var DFX100_SPEECH = /(言|叫|呟|つぶや|囁|ささや|漏らし|唸|呻|うめ|告げ|呼び|口にし|吐き|紡|嘯|独り言|ぼやい|わめ|怒鳴|発し)/;
  function resolvePreSpeaker(narr, text){
    if (!narr || !text) return '';
    var qi = narr.indexOf('「' + text + '」');
    if (qi < 0){ qi = narr.indexOf(text); if (qi < 0) return ''; }
    var win = narr.slice(0, qi).slice(-160);
    var segs = win.split(/[。\n]/).filter(function(s){ return s.trim(); });
    if (!segs.length) return '';
    var lastSent = segs[segs.length - 1];
    if (!DFX100_SPEECH.test(lastSent)) return '';   // preceding sentence must be an utterance
    var m = lastSent.match(/([^、。\s「」はがをにへとのもだでも！？!?]{2,16})(?:は|が)/);
    if (!m) return '';
    var subj = m[1];
    var parts = subj.split(/(?:から|まで|より|へ|で|に|を|と|の|も)/);
    subj = parts[parts.length - 1];
    subj = subj.replace(/^(?:その|この|あの|新たな|新しい|例の|件の|赤黒い|青白い|小さな|大きな|黒い|白い|赤い|不気味な|巨大な)/, '').trim();
    if (subj.length < 2) return '';
    return subj;
  }

  // ---------- v292Dfix101: right-panel (展開の描写) escape-leak sanitizer ----------
  // The right narrative panel splits on real newlines into <p> and converts real
  // <say> tags. When the model emits ESCAPED output (literal \n, \" and an escaped
  // <say who=\"X\"> tag), the renderer can't process it → the raw "\n" and the tag
  // show as visible text. preprocessNarrative fixes the LEFT log; this cleans the
  // already-rendered RIGHT panel. Operates only on <p>/<span> (never buttons), and
  // is idempotent (after cleaning there are no artifacts left to match).
  function sanitizeNarrHtml(html){
    if (!html) return html;
    if (!/\\n|\\t|\\r|\\"|&lt;\/?say|<\/?say/i.test(html) && html.indexOf('\\') < 0) return html;
    var out = html;
    out = out.replace(/&lt;\/?say[^&]*?&gt;/gi, '');   // entity-escaped <say ...> / </say>
    out = out.replace(/<\/?say[^>]*>/gi, '');           // raw <say ...> / </say>
    out = out.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    out = out.replace(/\\r\\n/g, '<br>').replace(/\\r/g, '<br>').replace(/\\n/g, '<br>').replace(/\\t/g, ' ');
    return out;
  }
  function sanitizeRightPanel(){
    try {
      var story = document.getElementById('story');
      if (!story) return;
      var nodes = story.querySelectorAll('.narr-block p, .narr-block span, .narr-block .dial');
      for (var i = 0; i < nodes.length; i++){
        var el = nodes[i];
        if (el.querySelector && el.querySelector('button')) continue;  // never touch button hosts
        var h = el.innerHTML;
        var cleaned = sanitizeNarrHtml(h);
        if (cleaned !== h) el.innerHTML = cleaned;
      }
      // v292Dfix113b: remove a leaked 【…ルール監査】 self-audit block from the
      // right panel. It renders as trailing <p> children ("【重要ルール監査】" then
      // "・…" bullets) before the ✎編集 button. Within EACH narr-block, drop the
      // marker <p> and the following audit <p>s, but keep buttons and the prose.
      var blocks = story.querySelectorAll('.narr-block');
      for (var b = 0; b < blocks.length; b++){
        var kids = blocks[b].children;
        var hit = -1;
        for (var c = 0; c < kids.length; c++){
          var _kt = kids[c].textContent || '';
          // v292Dfix124b: also catch the PLAIN-TEXT self-audit header (no 【】), e.g. a
          // <p> starting with "フィードバック：…". Removes it + the following bullet <p>s.
          if (/【[^】\n]{0,30}(?:物語の進行|物語の推進|物語の展開|キャラの反応|反応=|セリフ|反復|ルール監査|出力の鉄則|登場キャラ|内部指示|最重要|掛け合い|テンポ)[^】\n]{0,30}】/.test(_kt)
              || /^[\s　]*(?:フィードバック|評価|総評|講評|自己点検|自己評価|チェック(?:項目|リスト)?|補足説明|内部メモ|ルール(?:確認|準拠|チェック))[\s　]*[：:]/.test(_kt)){ hit = c; break; }
        }
        if (hit < 0) continue;
        for (var d = kids.length - 1; d >= hit; d--){
          var k = kids[d];
          if (k.tagName === 'BUTTON') continue;
          if (k.querySelector && k.querySelector('button')) continue;
          if (k.parentNode) k.parentNode.removeChild(k);
        }
      }
    } catch(e){}
  }

  // ---------- v292Dfix104: second-pass LLM dialogue extraction (Option B) ----------
  // The prose heuristics (fix97/98/100) can't catch every Japanese form (天狗 / 「空気」
  // mis-attribution / observer exclamations…). Instead, after a turn's narrative exists,
  // ask a cheap UNCENSORED model (Hermes 4 70B) to list {speaker,text} for that ONE turn,
  // and build the log from it. Falls back to the heuristics if extraction is missing or
  // fails — so nothing breaks. 展開 stays fully free (the MAIN call is untouched).
  // Key is read from chr6.cfg.orKey at call time and never logged. Uses XHR to bypass the
  // fix84 fetch-wrapper so temperature stays 0 (deterministic extraction).
  // v292Dfix104b: use the SAME model as the main call (cfg.orModel = Hermes 4 405B).
  // Validation showed 70B mis-attributes hard cases (天狗→フィーネ) while 405B gets them
  // right (天狗) and honestly returns ??? only when truly ambiguous. Extraction input is
  // one small turn, so 405B here is still cheap (~0.2 yen/turn).
  function bModel(){
    try { var c = JSON.parse(localStorage.getItem('chr6') || '{}').cfg || {}; if (c.orModel) return c.orModel; } catch(e){}
    return 'nousresearch/hermes-4-405b';
  }
  var B_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
  var B_CACHE_KEY = 'chr6_v292Dfix104_dlg';
  var B_OFF_KEY   = 'chr6_v292Dfix104_off';
  var B_CACHE = (function(){ try { return JSON.parse(localStorage.getItem(B_CACHE_KEY) || '{}') || {}; } catch(e){ return {}; } })();
  var B_PENDING = Object.create(null);
  var B_FAILS   = Object.create(null);
  var B_QUEUE   = [];
  var B_BUSY    = false;
  var B_DIRTY   = false;
  var B_MAX_FAILS = 3;
  function bSaveCache(){ try { localStorage.setItem(B_CACHE_KEY, JSON.stringify(B_CACHE)); } catch(e){} }
  function bGet(preNarr){ var v = B_CACHE[ncHash(preNarr)]; return (v && v.length) ? v : null; }
  function bHasQuote(s){ return /[「『][^」』]/.test(s || ''); }
  function bEnabled(){
    try {
      if (localStorage.getItem(B_OFF_KEY)) return false;
      var c = (JSON.parse(localStorage.getItem('chr6') || '{}').cfg) || {};
      return c.provider === 'openrouter' && !!c.orKey;
    } catch(e){ return false; }
  }
  function bBuildPrompt(narr, names){
    return 'You extract spoken dialogue from one scene of a Japanese story.\n'
      + 'Known characters: ' + (names && names.length ? names.join(', ') : '(none listed)') + '.\n'
      + 'List EVERY line a character SPEAKS ALOUD, in the order it appears, with the speaker.\n'
      + 'Rules:\n'
      + '- Copy each line EXACTLY as written (verbatim; do NOT paraphrase, translate, or trim).\n'
      + '- speaker = whoever the prose attributes the line to. For non-cast beings, use the name the prose uses (e.g. 怪異, 天狗, 人形).\n'
      + '- Do NOT include sound effects, onomatopoeia, or narration — only real spoken words.\n'
      + '- If a line\'s speaker is genuinely unknown, use "???".\n'
      + '- Output ONLY a JSON array, nothing else: [{"speaker":"name","text":"line"}]\n'
      + 'Scene:\n' + narr;
  }
  function bParse(text){
    if (!text) return null;
    var s = String(text), i = s.indexOf('['), j = s.lastIndexOf(']');
    if (i < 0 || j < 0 || j < i) return null;
    try {
      var arr = JSON.parse(s.slice(i, j + 1));
      if (!Array.isArray(arr)) return null;
      var out = [];
      for (var k = 0; k < arr.length; k++){
        var o = arr[k];
        if (o && o.text != null && String(o.text).trim()){
          out.push({ speaker: String(o.speaker || '').trim(), text: String(o.text).trim() });
        }
      }
      return out;
    } catch(e){ return null; }
  }
  function bCall(narr, names, cb){
    var key = '';
    try { var c = JSON.parse(localStorage.getItem('chr6') || '{}'); key = (c.cfg && c.cfg.orKey) || ''; } catch(e){}
    if (!key){ cb(null); return; }
    var body;
    try { body = JSON.stringify({ model: bModel(), temperature: 0, max_tokens: 900,
      messages: [{ role: 'user', content: bBuildPrompt(narr, names) }] }); } catch(e){ cb(null); return; }
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', B_ENDPOINT, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Authorization', 'Bearer ' + key);
      xhr.timeout = 30000;
      xhr.onload = function(){
        if (xhr.status >= 200 && xhr.status < 300){
          try {
            var j = JSON.parse(xhr.responseText);
            var content = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
            cb(bParse(content));
          } catch(e){ cb(null); }
        } else { cb(null); }
      };
      xhr.onerror = function(){ cb(null); };
      xhr.ontimeout = function(){ cb(null); };
      xhr.send(body);
    } catch(e){ cb(null); }
  }
  function bFullRebuild(){
    try {
      var s = document.getElementById('dialogue-stream');
      if (s) s.innerHTML = '';
      var ns = window.__v292Dfix66;
      if (ns && ns.repair) ns.repair();
    } catch(e){}
  }
  function bProcess(){
    if (B_BUSY || !B_QUEUE.length) return;
    var item = B_QUEUE.shift();
    if (B_CACHE[item.hash] || B_PENDING[item.hash]){ bProcess(); return; }
    B_PENDING[item.hash] = true; B_BUSY = true;
    bCall(item.narr, item.names, function(arr){
      delete B_PENDING[item.hash]; B_BUSY = false;
      if (arr && arr.length){ B_CACHE[item.hash] = arr; bSaveCache(); B_DIRTY = true; }
      else { B_FAILS[item.hash] = (B_FAILS[item.hash] || 0) + 1; }
      if (B_QUEUE.length){ setTimeout(bProcess, 300); }
      else if (B_DIRTY){ B_DIRTY = false; try { bFullRebuild(); } catch(e){} }
    });
  }
  function bSchedule(turns, names){
    if (!turns || !turns.length){
      if (Object.keys(B_CACHE).length){ B_CACHE = {}; bSaveCache(); }  // story reset → clean
      return;
    }
    if (!bEnabled()) return;
    for (var i = 0; i < turns.length; i++){
      var t = turns[i]; if (!t || !t.narrative) continue;
      var pre = preprocessNarrative(t.narrative);
      if (!bHasQuote(pre)) continue;
      var h = ncHash(pre);
      if (B_CACHE[h] || B_PENDING[h] || (B_FAILS[h] || 0) >= B_MAX_FAILS) continue;
      B_QUEUE.push({ hash: h, narr: pre, names: names });
    }
    bProcess();
  }

  // v292Dfix125: heuristic-path quality (used when the LLM extraction isn't cached).
  // (a) a quote that's an onomatopoeia/sound ("カサッ" + という音/物音/声) is NOT speech.
  function isOnomatopoeiaQuote(pre, text){
    if (!text) return false;
    try {
      var i = pre.indexOf('「' + text + '」');
      if (i >= 0){
        var after = pre.slice(i + text.length + 2, i + text.length + 16);
        if (/^という[^。]{0,8}(?:音|物音|声|響き|轟き|悲鳴|うなり|軋み)/.test(after)) return true;
      }
    } catch(e){}
    var t = String(text).replace(/[…⋯。、！!？?\s　]/g, '');
    if (t.length <= 6 && /^[ァ-ヶ゛゜ー]+$/.test(t) && /[ッーッ]/.test(text)) return true;  // 短い純カタカナ擬音
    return false;
  }
  // (b) when a quote got attributed to the only cast member but the clause AFTER it names a
  // NON-cast entity with a speech verb ("「ここにおいで」 …骸骨は静かに告げる" → 骸骨, not ミリア),
  // re-attribute to that entity. Only overrides to a NON-cast name → safe for cast-cast cases.
  function postQuoteNonCastSpeaker(pre, text, names){
    try {
      var i = pre.indexOf('「' + text + '」');
      if (i < 0) return '';
      var after = pre.slice(i + text.length + 2, i + text.length + 2 + 60);
      after = after.split('「')[0];  // stay within this attribution clause
      var m = after.match(/([一-龯ァ-ヶ][^\s、。「」（）]{0,6})(?:は|が)[^。「」]{0,14}(?:告げ|言っ|言う|呟|囁|叫|応え|返し|呻|嗤|笑っ|尋ね|問う|怒鳴|名乗|ささや|つぶや|声を)/);
      if (!m) return '';
      var ent = m[1].replace(/^(?:その|この|あの|新たな|新しい|例の|件の|低い|高い|青白い|赤黒い|不気味な|小さな|大きな|黒い|白い|一つの|一体の)/, '').trim();
      if (ent.length < 2) return '';
      if (names && names.indexOf(ent) >= 0) return '';   // a cast name → leave to other resolvers
      return ent;
    } catch(e){}
    return '';
  }
  // v292Dfix126: collect texts the model explicitly tagged as ANONYMOUS speakers
  // (<say who="？"> / <say who="?"> / <say who="???">). The model uses ？ deliberately
  // to mark a mysterious/unknown voice; downstream resolvers (resolveNonCastSpeaker /
  // postQuoteNonCastSpeaker / fix65 proximity guess) sometimes overwrite it with the
  // nearest cast member (e.g. ミリア). This helper builds a set so we can restore the
  // intentional anonymity AFTER resolvers run.
  function anonymousTexts(narr){
    var map = Object.create(null);
    if (!narr) return map;
    try {
      var re = /<say\s+who="(\?|？|\?{2,}|？{2,})"\s*>([\s\S]*?)<\/say>/g, m;
      while ((m = re.exec(narr)) !== null){
        var t = (m[2] || '').trim();
        if (t) map[t] = true;
      }
    } catch(e){}
    return map;
  }
  function isAnonSpeakerLabel(s){
    if (!s) return false;
    var t = String(s).trim();
    return t === '？' || t === '?' || t === '???' || t === '？？？' || /^[?？]+$/.test(t);
  }
  // v292Dfix125b: is `text` an actual spoken line (inside 「」/『』) in the narrative?
  // Used to drop STORY/DO scene-direction echo cards (narration, not in quotes) while
  // keeping real spoken lines (SAY / character dialogue, which the prose puts in 「」).
  function quotedInNarr(narr, text){
    if (!narr || !text) return false;
    if (narr.indexOf('「' + text + '」') >= 0 || narr.indexOf('『' + text + '』') >= 0) return true;
    try { var re = /[「『]([^「」『』]{1,120})[」』]/g, m; while ((m = re.exec(narr)) !== null){ if (m[1].indexOf(text) >= 0 || text.indexOf(m[1]) >= 0) return true; } } catch(e){}
    return false;
  }
  function extractFromTurn(turn){
    var narr = turn && turn.narrative;
    if (!narr) return [];
    var preprocessed = preprocessNarrative(narr);
    // v292Dfix126: per-turn map of texts the model tagged as anonymous (<say who="？">)
    var _anonMap = anonymousTexts(narr);
    // v292Dfix129: estimate dialogue count from the preprocessed narrative — number of
    // 「...」 quotes (excluding obvious onomatopoeia/citation). Used to decide whether the
    // bGet cache is COMPLETE enough to trust, or if we should fall through to heuristic
    // extraction. Without this, an under-extracted cached entry (LLM only returned 1 of N
    // lines) would silently drop the missing dialogues forever, even after repair() runs.
    var _quoteEstimate = 0;
    try {
      var qre = /「([^「」\n]{1,120})」/g, qm;
      while ((qm = qre.exec(preprocessed)) !== null){
        var qt = qm[1];
        if (!isOnomatopoeiaQuote(preprocessed, qt) && !isNonSpeechQuote(preprocessed, qt)) _quoteEstimate++;
      }
    } catch(_){}
    // v292Dfix104: prefer the LLM extraction for this turn if we have it.
    // v292Dfix129: only when it covers at least the expected number of lines — otherwise
    // fall through to heuristic and merge bGet's speaker labels onto what heuristic finds.
    var bres = bGet(preprocessed);
    var _bresUseFull = !!(bres && bres.length >= _quoteEstimate);
    if (_bresUseFull){
      var bout = [], bseen = Object.create(null);
      for (var bi = 0; bi < bres.length; bi++){
        var be = bres[bi];
        if (!be || !be.text) continue;
        // v292Dfix126b: also enforce anonymity restoration in the LLM-extraction path.
        // bGet's prompt allows "???" for unknown speakers; cached extractions may also
        // attribute mystery lines to a nearby cast. Pin to '？' if the model tagged it.
        var beSp = be.speaker;
        try { if (_anonMap[String(be.text).trim()]) beSp = '？'; } catch(e){}
        var bk = dialogueKey(beSp, be.text);
        if (bseen[bk]) continue; bseen[bk] = true;
        bout.push({ speaker: beSp, text: be.text });
      }
      bout.sort(function(a, b){
        var ia = preprocessed.indexOf(a.text); if (ia === -1) ia = Number.MAX_SAFE_INTEGER;
        var ib = preprocessed.indexOf(b.text); if (ib === -1) ib = Number.MAX_SAFE_INTEGER;
        return ia - ib;
      });
      return bout;
    }
    // v292Dfix129: build a text→speaker map from the (incomplete) bGet cache so we can
    // still benefit from its speaker resolution for any line that's in both. Heuristic
    // path picks up the missing ones; if a line is in bMap, prefer that speaker.
    var _bMap = Object.create(null);
    try { if (bres) for (var _bi = 0; _bi < bres.length; _bi++){ var _be = bres[_bi]; if (_be && _be.text) _bMap[String(_be.text).trim()] = _be.speaker || ''; } } catch(_){}
    var out = [];
    var seen = Object.create(null);
    var _names = castNameList();
    try {
      var dl = window.__v292 && window.__v292.dialogueLayout;
      if (dl && typeof dl.extractDialogues === 'function'){
        var ds = dl.extractDialogues(preprocessed, turn) || [];
        for (var i = 0; i < ds.length; i++){
          var d = ds[i];
          if (!d || !d.text) continue;
          // v292Dfix89: skip non-speech quotes (citation/concept, not dialogue)
          if (isNonSpeechQuote(preprocessed, String(d.text))) continue;
          // v292Dfix125: skip onomatopoeia/sound quotes ("カサッ"→という鈍い音)
          if (isOnomatopoeiaQuote(preprocessed, String(d.text))) continue;
          // v292Dfix97: resolve post-positioned speaker (「…」と、◯◯の悲鳴…)
          if (!d.speaker){
            var rs = resolvePostQuoteSpeaker(preprocessed, String(d.text), _names);
            if (rs) d.speaker = rs;
          }
          // v292Dfix98: a non-cast entity named by the prose (妖怪/モンスター/怪異/独自名)
          // overrides a wrong proximity-guessed cast speaker (e.g. しゃ…… → 人形, not フィーネ).
          var nc = resolveNonCastSpeaker(preprocessed, String(d.text), _names);
          if (nc) d.speaker = nc;
          // v292Dfix100: pre-positioned speaker (◯◯は…発話動詞。「…」) — fill ??? only.
          if (!d.speaker){
            var pc = resolvePreSpeaker(preprocessed, String(d.text));
            if (pc) d.speaker = pc;
          }
          // v292Dfix125: a non-cast entity named right after the quote ("…骸骨は告げる")
          // overrides a wrong only-cast proximity guess.
          var pqo = postQuoteNonCastSpeaker(preprocessed, String(d.text), _names);
          if (pqo && pqo !== d.speaker) d.speaker = pqo;
          // v292Dfix126: if the model explicitly tagged this line as anonymous
          // (<say who="？">), restore '？' even if resolvers overwrote it to a cast name.
          try { if (_anonMap[String(d.text).trim()]) d.speaker = '？'; } catch(e){}
          // v292Dfix129: if bGet's incomplete cache has a speaker for this exact line, prefer it
          // (LLM extraction is generally more accurate than heuristic proximity guessing).
          // Anonymous pin from above wins — don't override '？' with a cached cast name.
          try {
            var _bsp = _bMap[String(d.text).trim()];
            if (_bsp && d.speaker !== '？' && !_anonMap[String(d.text).trim()]) d.speaker = _bsp;
          } catch(e){}
          var k = dialogueKey(d.speaker, d.text);
          if (seen[k]) continue;
          seen[k] = true;
          out.push(d);
        }
      }
    } catch(e){
      try { console.warn(TAG, 'extract err on turn:', e && e.message); } catch(_){}
    }
    // v292Dfix89: stable reading order within the turn (pattern/wrapper order
    // is not text order; sort by first occurrence so the log follows narrative).
    out.sort(function(a,b){
      var ia = preprocessed.indexOf(a.text); if (ia === -1) ia = Number.MAX_SAFE_INTEGER;
      var ib = preprocessed.indexOf(b.text); if (ib === -1) ib = Number.MAX_SAFE_INTEGER;
      return ia - ib;
    });
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

  // v292Dfix113b: the model sometimes appends a "【…ルール監査】" self-audit
  // block (echoing the prompt's rules) to the narrative. The prompt guard
  // reduces but can't 100% stop it. Strip it physically from the stored
  // narrative so it never shows (right panel + conv-log) AND never feeds back
  // into recentHistory (which would reinforce the model repeating it). The
  // marker is highly specific, so false-positives on real prose are negligible.
  // v292Dfix115b: broadened from just 【…ルール監査】 to ALL of our appended
  // rule-block headers (and the model's paraphrases like 【物語の進行】) that can
  // leak into prose. Matches a 【…】 containing a rule keyword + everything after.
  function stripRuleAudit(s){
    if (!s || typeof s !== 'string') return s;
    return s
      .replace(/【[^】\n]{0,30}(?:物語の進行|物語の推進|物語の展開|キャラの反応|反応=|セリフ|反復|ルール監査|出力の鉄則|登場キャラ|内部指示|最重要|掛け合い|テンポ)[^】\n]{0,30}】[\s\S]*$/, '')
      // v292Dfix124: also cut a trailing PLAIN-TEXT self-audit block (no 【】), e.g.
      // "フィードバック：…正しく機能している点 ・…（進行ルール準拠）（初対面セリフ禁止規則対応）".
      // Anchored on an audit header at line start + ：/: so real prose isn't touched.
      .replace(/(?:^|\n)[\s　]*(?:フィードバック|フィードバック評価|評価|総評|講評|自己点検|自己評価|チェック(?:項目|リスト)?|補足説明|内部メモ|ルール(?:確認|準拠|チェック))[\s　]*[：:][\s\S]*$/, '')
      .replace(/[\s　]+$/, '');
  }

  // ---------- main: render-hook repair ----------
  function repair(){
    try {
      // v292Dfix101: clean any escape-leak (\n / <say>) from the right narrative panel
      sanitizeRightPanel();
      var stream = document.getElementById('dialogue-stream');
      if (!stream) return 0;
      var st = getState();
      var turns = st.turns || [];
      if (!turns.length) return 0;
      // v292Dfix113b: scrub any leaked 【…ルール監査】 block from stored turns
      // (clears display + conv-log + future recentHistory in one shot). Idempotent.
      for (var _ti = 0; _ti < turns.length; _ti++){
        if (turns[_ti] && typeof turns[_ti].narrative === 'string'){
          var _cl = stripRuleAudit(turns[_ti].narrative);
          if (_cl !== turns[_ti].narrative) turns[_ti].narrative = _cl;
        }
      }
      // Also scrub the LIVE lexical state (getState() above returns a localStorage
      // copy when window.S is absent, so the real S.turns — which feeds the next
      // turn's recentHistory — would keep the leak and re-trigger it). Strip it at
      // the source and persist, so the model never sees the audit block again.
      try {
        if (typeof S !== 'undefined' && S && S.turns){
          var _liveChanged = false;
          for (var _si = 0; _si < S.turns.length; _si++){
            if (S.turns[_si] && typeof S.turns[_si].narrative === 'string'){
              var _sc = stripRuleAudit(S.turns[_si].narrative);
              if (_sc !== S.turns[_si].narrative){ S.turns[_si].narrative = _sc; _liveChanged = true; }
            }
          }
          if (_liveChanged && typeof S.save === 'function'){ try { S.save(); } catch(e){} }
        }
      } catch(e){}
      var hero = getHero(st);
      var existing = collectExistingKeys(stream);
      // v292Dfix89: fix66 runs last, so remove non-speech cards that EARLIER
      // render hooks may have injected (additive repair never removed them).
      // Citations like 「X」という事実 are not dialogue and must not stay in the log.
      try {
        var __allNarr = '';
        for (var __ti = 0; __ti < turns.length; __ti++){
          if (turns[__ti]) __allNarr += '\n' + preprocessNarrative(turns[__ti].narrative);
        }
        var __cards = stream.querySelectorAll('.v292-dlg-card');
        for (var __ci = 0; __ci < __cards.length; __ci++){
          var __c = __cards[__ci];
          var __nm = __c.querySelector('.dlg-name');
          var __tx = __c.querySelector('.dlg-text');
          if (!__tx) continue;
          // v292Dfix110: fix a doubled speaker name ("AはA" -> "A") in-place on
          // ANY existing card (incl. ones built by earlier render hooks), so the
          // surviving card after dedup shows the clean name.
          if (__nm){
            var __fcn = __nm.firstChild;
            if (__fcn && __fcn.nodeType === 3){
              var __raw = __fcn.textContent || '';
              var __dd = __raw.replace(/^(\s*)(.+?)(?:は|が|も|と)\2(\s*)$/, '$1$2$3');
              if (__dd !== __raw) __fcn.textContent = __dd;
            }
          }
          // v292Dfix91c: 会話ログは「発言ログ」。STORY(展開)/DO(行動) の入力echoカード
          // (fix56 製) はセリフではないので除去する。SAY(発話) は主人公の発言なので残す。
          if (__c.className.indexOf('v292Dfix56-input-card') !== -1 &&
              __nm && /展開|行動/.test(__nm.textContent || '') && __c.parentNode){
            __c.parentNode.removeChild(__c);
            continue;
          }
          // v292Dfix125b: also drop STORY/DO scene-direction echo cards that have NO visible
          // 展開/行動 badge (they slip past the rule above) — narration, not dialogue. A real
          // spoken line appears inside 「」 in the narrative; scene-direction doesn't.
          if (__c.className.indexOf('v292Dfix56-input-card') !== -1 && __c.parentNode){
            var __itx = (__tx.textContent || '').trim();
            if (__itx && !quotedInNarr(__allNarr, __itx)){ __c.parentNode.removeChild(__c); continue; }
          }
          // skip input/STORY badge cards (📖 展開 等) — only plain dialogue cards
          if (__nm && /📖|⚔|💭|🎭|✨|展開/.test(__nm.textContent || '')) continue;
          var __ct = (__tx.textContent || '').trim();
          if (__ct && isNonSpeechQuote(__allNarr, __ct) && __c.parentNode){
            __c.parentNode.removeChild(__c);
            continue;
          }
          // v292Dfix125: drop onomatopoeia/sound cards ("カサッ"→という鈍い音) — not speech.
          if (__ct && isOnomatopoeiaQuote(__allNarr, __ct) && __c.parentNode){
            __c.parentNode.removeChild(__c);
            continue;
          }
        }
      } catch(__e){}
      // v292Dfix99: expose all-turns narrative so lookupAvatar can derive a
      // non-cast entity's appearance for auto-generated avatars.
      try { if (typeof __allNarr === 'string') NC_NARR = __allNarr; } catch(__ne){}
      var added = 0;
      for (var i = 0; i < turns.length; i++){
        var t = turns[i];
        if (!t) continue;
        var ds = extractFromTurn(t);
        for (var j = 0; j < ds.length; j++){
          var d = ds[j];
          if (isSayEcho(t, d, hero)) continue;
          // v292Dfix110: clean the doubled-name glitch for display + dedup key.
          var sp = cleanSpeakerName(d.speaker);
          var k = dialogueKey(sp, d.text);
          if (existing[k]) continue;
          var isHeroFlag = !!d.isHero || (sp && sp === hero);
          var card = buildCard(sp, d.text, isHeroFlag);
          stream.appendChild(card);
          existing[k] = true;
          added++;
        }
      }
      // v292Dfix91: 全カードに地の文 beat を後付け（__allNarr は上で構築済みを再利用）。
      try {
        if (typeof __allNarr === 'string' && __allNarr) enhanceBeats(stream, __allNarr);
      } catch(__be){}
      // v292Dfix102: upgrade any stale / cold-start "?" avatars on every repair.
      try { upgradeMissingAvatars(stream); } catch(__ua){}
      // v292Dfix104: queue LLM dialogue extraction for any uncached turns (async).
      try { bSchedule(turns, castNameList()); } catch(__bse){}
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
    lookupAvatar: lookupAvatar,
    // v292Dfix123: expose the entity context so fix118's generator can describe non-cast
    // entities (creatures/people/etc.) from the story prose, not a fixed horror template.
    isCast: function(name){ try { var st = getState(); if (st && st.cast){ if (st.cast.hero && st.cast.hero.name === name) return true; var a = st.cast.npcs || []; for (var i = 0; i < a.length; i++){ if (a[i] && a[i].name === name) return true; } } } catch(e){} return false; },
    ncAppearanceFor: function(name){ try { return ncAppearance(name, NC_NARR); } catch(e){} return ''; },
    // v292Dfix104: manual extraction trigger (also bypasses any repair() wrapper,
    // so it can be invoked directly to (re)build the LLM dialogue cache).
    runExtraction: function(){
      try { var st = getState(); bSchedule((st && st.turns) || [], castNameList()); } catch(e){}
    }
  };

  // Manual re-trigger shortcut
  window.regenerateConvLogV66 = function(){ return repair(); };

  // v292Dfix125c: standalone conv-log sweep on an interval — guarantees the cleanup
  // (drop STORY/DO scene-direction echo cards + onomatopoeia cards) wins the timing war
  // with fix56/64's restore, even if they add cards AFTER repair's last run. Idempotent:
  // once removed cards stay gone; real dialogue is untouched (text appears in 「」).
  // v292Dfix127: track turn-count so sweep can force-repair when a new turn arrives
  // (covers the case where the render hook didn't fire — e.g. SAY input where the
  // narrative was written but the conv-log wasn't updated). Idempotent: repair()'s
  // existing-key dedup means re-runs cost nothing if cards are already up to date.
  var _lastSweepTurnCount = -1;
  var _lastSweepNarrLen = 0;
  // v292Dfix128: track the high-water mark of conv-log card count so we can detect a
  // drop (some other feature — fix64-restore etc. — cleared/rebuilt the stream) and
  // immediately repair, stopping the visible "ピコピコ" appear/disappear loop that
  // emerges when another feature periodically wipes cards faster than our 1.2s sweep
  // can re-add them. Reset to 0 on turn-count change (legit deletion via undo/retry).
  var _peakCardCount = 0;
  function sweepConvLogCards(){
    try {
      var stream = document.getElementById('dialogue-stream');
      if (!stream) return;
      var st = getState(); var turns = (st && st.turns) || []; if (!turns.length) return;
      // v292Dfix127: detect "new turn" or "narrative grew" since last sweep, and trigger
      // repair() to add any missing dialogue cards. Bounded — only fires on actual change.
      try {
        var _curTC = turns.length;
        var _curLastN = (turns[_curTC - 1] && turns[_curTC - 1].narrative) ? String(turns[_curTC - 1].narrative).length : 0;
        if (_curTC !== _lastSweepTurnCount || _curLastN !== _lastSweepNarrLen){
          if (_curTC !== _lastSweepTurnCount) _peakCardCount = 0;  // v292Dfix128: legit turn add/remove → reset
          _lastSweepTurnCount = _curTC;
          _lastSweepNarrLen = _curLastN;
          var _ns = window.__v292Dfix66;
          if (_ns && typeof _ns.repair === 'function'){
            try { _ns.repair(); } catch(_){}
          }
        }
      } catch(_){}
      // v292Dfix128: card-count regression detector — another feature wiped cards →
      // re-run repair() immediately so the conv-log doesn't visibly flicker between
      // "all cards" and "partial cards" while our 1.2s loop catches up.
      try {
        var _curCC = stream.querySelectorAll('.v292-dlg-card').length;
        if (_curCC < _peakCardCount){
          var _ns2 = window.__v292Dfix66;
          if (_ns2 && typeof _ns2.repair === 'function'){
            try { _ns2.repair(); } catch(_){}
            _curCC = stream.querySelectorAll('.v292-dlg-card').length;
          }
        }
        if (_curCC > _peakCardCount) _peakCardCount = _curCC;
      } catch(_){}
      var allNarr = '';
      // v292Dfix126: aggregate anonymity map across all turns (model-tagged <say who="？">)
      var anonAll = Object.create(null);
      for (var i = 0; i < turns.length; i++){
        if (!turns[i]) continue;
        var rawN = turns[i].narrative || '';
        allNarr += '\n' + preprocessNarrative(rawN);
        try { var am = anonymousTexts(rawN); for (var amk in am){ anonAll[amk] = true; } } catch(_){}
      }
      var cards = stream.querySelectorAll('.v292-dlg-card');
      for (var c = 0; c < cards.length; c++){
        var __c = cards[c];
        var __tx = __c.querySelector('.dlg-text');
        if (!__tx) continue;
        var __t = (__tx.textContent || '').trim();
        if (!__t) continue;
        // STORY/DO scene-direction echo input card whose text isn't a quoted utterance → drop
        if (__c.className.indexOf('v292Dfix56-input-card') !== -1 && !quotedInNarr(allNarr, __t)){
          if (__c.parentNode) __c.parentNode.removeChild(__c);
          continue;
        }
        // onomatopoeia/sound card → drop
        if (isOnomatopoeiaQuote(allNarr, __t)){
          if (__c.parentNode) __c.parentNode.removeChild(__c);
          continue;
        }
        // v292Dfix126: restore '？' for cards whose text was tagged anonymous in narrative
        // v292Dfix126b: normalize ANY anon marker (?/???/？？？) to canonical '？' so the
        // user sees a consistent label across turns (model + bGet sometimes pick '???').
        try {
          if (anonAll[__t]){
            var __nm = __c.querySelector('.dlg-name');
            if (__nm){
              var __cur = (__nm.textContent || '').trim();
              if (__cur !== '？'){
                __nm.textContent = '？';
                __nm.setAttribute('data-anon', '1');
              }
            }
          }
        } catch(_){}
      }
    } catch(e){}
  }
  try { setInterval(sweepConvLogCards, 1200); } catch(e){}

  // v292Dfix128b: MutationObserver on #dialogue-stream — catches stream wipes and new
  // card insertions faster than the 1.2s sweep (sub-50ms reaction). On REMOVAL → run
  // sweep (which calls repair() via the peak-detector path → restore missing cards in
  // one tick, killing the visible ピコピコ flicker). On ADDITION → kick __aiAvatar.refreshAll
  // so any cached AI URL is swapped in immediately, eliminating the fallback-template
  // flash that otherwise shows for ~1.2s before the next refreshAll tick.
  var _v128MO = null, _v128Schedule = false;
  function installStreamObserverV128(){
    try {
      var stream = document.getElementById('dialogue-stream');
      if (!stream || _v128MO) return;
      _v128MO = new MutationObserver(function(muts){
        var rem = 0, add = 0;
        for (var i = 0; i < muts.length; i++){
          if (muts[i].removedNodes) rem += muts[i].removedNodes.length;
          if (muts[i].addedNodes)   add += muts[i].addedNodes.length;
        }
        if ((rem > 0 || add > 0) && !_v128Schedule){
          _v128Schedule = true;
          setTimeout(function(){
            _v128Schedule = false;
            try { sweepConvLogCards(); } catch(_){}
            // avatar flicker kill: refresh AI URLs for any freshly inserted card
            try { if (window.__aiAvatar && window.__aiAvatar.refreshAll) window.__aiAvatar.refreshAll(); } catch(_){}
          }, 40);
        }
      });
      _v128MO.observe(stream, { childList: true });
    } catch(e){}
  }
  setTimeout(installStreamObserverV128, 800);
  setTimeout(installStreamObserverV128, 2500);
  setTimeout(installStreamObserverV128, 6000);

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

  // v292Dfix102: bounded retries for cold-start avatars. A non-cast entity's
  // Pollinations image is generated on first request (~30-40s); the first <img>
  // load can fail → onerror → "?". These delayed repairs re-insert the <img> for
  // any "?" card once the image has had time to warm up, with no user reload needed.
  // v292Dfix109: extended retry windows (was 4/10/20/35s) so transient
  // Pollinations 402 (rate-limit) spells that last longer than 35s still
  // recover the avatar on their own — no user reload needed. 8 attempts to 180s.
  [4000, 10000, 20000, 35000, 60000, 90000, 120000, 180000].forEach(function(ms){
    setTimeout(function(){
      try {
        var s = document.getElementById('dialogue-stream');
        if (s) upgradeMissingAvatars(s);
      } catch(e){}
    }, ms);
  });

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
