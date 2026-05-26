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
  function ncAppearance(name, narr){
    if (!name || !narr) return '';
    var pos = narr.indexOf(name);
    if (pos < 0) return '';
    var s1 = narr.lastIndexOf('。', pos), s2 = narr.lastIndexOf('\n', pos);
    var start = Math.max(s1, s2) + 1;
    var chunk = narr.slice(start, start + 200);
    var m = chunk.match(/^(?:[^。\n]*[。\n]){1,3}/);
    var appear = (m ? m[0] : chunk);
    appear = appear.replace(/[「『〝][^」』〟]*[」』〟]/g, ' ');  // drop quoted speech
    appear = appear.replace(/\s+/g, ' ').trim();
    if (appear.length > 150) appear = appear.slice(0, 150);
    return appear;
  }
  function ncBuildAvatar(name){
    if (!name || name === '???' ) return '';
    if (NC_AVATARS[name]) return NC_AVATARS[name];
    var appear = ncAppearance(name, NC_NARR);
    var subject = appear ? (name + ', ' + appear) : (name + ', mysterious figure');
    var prompt = 'anime portrait of ' + subject + ', fantasy, dramatic lighting, high quality';
    var seed = ncHash(name) % 1000000;
    var url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt)
            + '?width=384&height=384&seed=' + seed + '&nologo=true&model=flux';
    NC_AVATARS[name] = url;
    return url;
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
    // v292Dfix99: not a cast member → auto-generate an avatar from the prose
    try {
      var nc = ncBuildAvatar(name);
      if (nc) return nc;
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

  function extractFromTurn(turn){
    var narr = turn && turn.narrative;
    if (!narr) return [];
    var preprocessed = preprocessNarrative(narr);
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
          // v292Dfix97: resolve post-positioned speaker (「…」と、◯◯の悲鳴…)
          if (!d.speaker){
            var rs = resolvePostQuoteSpeaker(preprocessed, String(d.text), _names);
            if (rs) d.speaker = rs;
          }
          // v292Dfix98: a non-cast entity named by the prose (妖怪/モンスター/怪異/独自名)
          // overrides a wrong proximity-guessed cast speaker (e.g. しゃ…… → 人形, not フィーネ).
          var nc = resolveNonCastSpeaker(preprocessed, String(d.text), _names);
          if (nc) d.speaker = nc;
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
          // v292Dfix91c: 会話ログは「発言ログ」。STORY(展開)/DO(行動) の入力echoカード
          // (fix56 製) はセリフではないので除去する。SAY(発話) は主人公の発言なので残す。
          if (__c.className.indexOf('v292Dfix56-input-card') !== -1 &&
              __nm && /展開|行動/.test(__nm.textContent || '') && __c.parentNode){
            __c.parentNode.removeChild(__c);
            continue;
          }
          // skip input/STORY badge cards (📖 展開 等) — only plain dialogue cards
          if (__nm && /📖|⚔|💭|🎭|✨|展開/.test(__nm.textContent || '')) continue;
          var __ct = (__tx.textContent || '').trim();
          if (__ct && isNonSpeechQuote(__allNarr, __ct) && __c.parentNode){
            __c.parentNode.removeChild(__c);
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
          var k = dialogueKey(d.speaker, d.text);
          if (existing[k]) continue;
          var isHeroFlag = !!d.isHero || (d.speaker && d.speaker === hero);
          var card = buildCard(d.speaker, d.text, isHeroFlag);
          stream.appendChild(card);
          existing[k] = true;
          added++;
        }
      }
      // v292Dfix91: 全カードに地の文 beat を後付け（__allNarr は上で構築済みを再利用）。
      try {
        if (typeof __allNarr === 'string' && __allNarr) enhanceBeats(stream, __allNarr);
      } catch(__be){}
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
