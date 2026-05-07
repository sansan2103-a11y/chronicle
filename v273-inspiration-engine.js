// v273-inspiration-engine.js
// 目的: モデル本来の創造性を解放する「素材ヒント」を毎ターン注入し、
//       ナラティブ・アトラクター(同じ展開ループ)から脱出する
//
// 哲学:
//   従来: モデルに細かく禁止/指示する → 牢獄 → ループ
//   v273: モデルに自由を返し、刺激の種だけ与える → 創造性発揮
//
// 機能:
//   1. Theme roulette (15 テーマ、cooldown 5 ターン)
//   2. Voice mode rotation (8 モード、cooldown 3 ターン)
//   3. N-gram 重複検出 (直近 3 ターンのコピペセリフ検出)
//   4. Tone shift detection (4 ターン暗が続けば pacing 変更を提案)
//   5. Soft injection (「自由に使え、無視可」を明記)
//
// 暴走防止:
//   - 強制ではなく「素材」として提示
//   - cooldown で連続使用を回避
//   - 既存文脈優先と明記
//
// ガード: window.__v273Active

(function v273() {
  'use strict';
  if (window.__v273Active) return;
  window.__v273Active = true;
  console.log('[v273] inspiration-engine init');

  var THEMES = [
    { key: '鏡', tags: '反射・虚像・二重' },
    { key: '血', tags: '痕跡・生命・汚染' },
    { key: '時間の歪み', tags: '遅延・記憶・静止' },
    { key: '忘却', tags: '記憶喪失・空白' },
    { key: '秘密', tags: '暴露・隠蔽・嘘' },
    { key: '再会', tags: '過去の人物・繋がり' },
    { key: '変容', tags: '異形・変身・成長' },
    { key: '光と影', tags: '境界・視界・コントラスト' },
    { key: '声', tags: '幻聴・叫び・囁き' },
    { key: '匂い', tags: '記憶の鍵・嗅覚' },
    { key: '失踪', tags: '消失・行方不明' },
    { key: '裏切り', tags: '信頼の反転' },
    { key: '残響', tags: '余韻・反復' },
    { key: '夢', tags: '非現実・象徴' },
    { key: '禁忌', tags: 'タブー・倫理超越' }
  ];

  var VOICE_MODES = [
    { key: '観察者', desc: '自分を客観視する。「私、震えてるな」のように三人称的に' },
    { key: '戦略家', desc: '状況を分析し次の手を考える。冷静・論理的' },
    { key: '記憶', desc: '過去の出来事や会話を回想として現在に挟む' },
    { key: '解離', desc: '現実感喪失。「これは映画だ。私じゃない」のように' },
    { key: '諦観', desc: '受け入れ。抵抗をやめた静けさ' },
    { key: '激情', desc: '怒り・憎しみ・恐怖の爆発' },
    { key: '無感', desc: '感情の麻痺。淡々とした描写' },
    { key: '諧謔', desc: '黒い笑い・皮肉。状況に対する冷笑' }
  ];

  // === State tracking ===
  function pushHistory(key, value, max) {
    var arr = window['__v273_' + key] || [];
    arr.push(value);
    while (arr.length > max) arr.shift();
    window['__v273_' + key] = arr;
  }

  function getHistory(key) {
    return window['__v273_' + key] || [];
  }

  function getRecentTurns() {
    try {
      var s = JSON.parse(localStorage.getItem('chr6') || '{}');
      return s.turns || [];
    } catch (e) { return []; }
  }

  // === Theme picker (cooldown-aware) ===
  function pickThemes() {
    var recent = getHistory('themes');
    var available = THEMES.filter(function (t) { return recent.indexOf(t.key) < 0; });
    if (available.length < 2) available = THEMES.slice(); // fallback
    var picked = [];
    while (picked.length < 2 && available.length) {
      var i = Math.floor(Math.random() * available.length);
      picked.push(available.splice(i, 1)[0]);
    }
    picked.forEach(function (t) { pushHistory('themes', t.key, 8); });
    return picked;
  }

  function pickVoice() {
    var recent = getHistory('voices');
    var available = VOICE_MODES.filter(function (v) { return recent.indexOf(v.key) < 0; });
    if (!available.length) available = VOICE_MODES.slice();
    var v = available[Math.floor(Math.random() * available.length)];
    pushHistory('voices', v.key, 4);
    return v;
  }

  // === Tone stuck detection (4 connesc dark turns) ===
  function detectToneStuck() {
    var turns = getRecentTurns().slice(-4);
    if (turns.length < 4) return false;
    var DARK_RX = /(絶望|死|もう無理|助けて|苦しい|痛|恐ろし|震え|涙|血|傷|呻|うめき)/g;
    var darkCount = 0;
    turns.forEach(function (t) {
      var narr = String(t.narrative || '');
      var matches = (narr.match(DARK_RX) || []).length;
      if (matches >= 3) darkCount++;
    });
    return darkCount >= 4;
  }

  // === N-gram repetition detection ===
  function extractRepeatedPhrases() {
    var turns = getRecentTurns().slice(-3);
    var phrases = [];
    turns.forEach(function (t) {
      var narr = String(t.narrative || '');
      // dialogues
      var dlgs = narr.match(/「([^「」]{6,40})」/g) || [];
      dlgs.forEach(function (m) {
        phrases.push(m.replace(/^「|」$/g, '').trim());
      });
      // inner thoughts
      var inner = narr.match(/《([^《》]{6,40})》/g) || [];
      inner.forEach(function (m) {
        phrases.push(m.replace(/^《|》$/g, '').trim());
      });
    });
    var counts = {};
    phrases.forEach(function (p) { counts[p] = (counts[p] || 0) + 1; });
    return Object.keys(counts).filter(function (p) { return counts[p] >= 2; }).slice(0, 6);
  }

  // === Build inspiration block ===
  function buildInspiration() {
    var themes = pickThemes();
    var voice = pickVoice();
    var stuck = detectToneStuck();
    var repeated = extractRepeatedPhrases();

    var lines = [];
    lines.push('');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('【参考素材 — 自由に使える刺激ヒント】');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');

    if (themes.length) {
      lines.push('');
      lines.push('🎭 雰囲気テーマ案 (組み込めれば参考に):');
      themes.forEach(function (t) {
        lines.push('  ・ ' + t.key + '  (' + t.tags + ')');
      });
    }

    if (voice) {
      lines.push('');
      lines.push('🎙️ 主人公の内心モード提案: 【' + voice.key + '】');
      lines.push('  → ' + voice.desc);
    }

    if (stuck) {
      lines.push('');
      lines.push('⚖️ 【pacing 提案】 直近 4 ターンが暗い緊張感の連続。');
      lines.push('  今ターンは: 静寂 / 微かな希望 / 別人物の優しさ / 諧謔 / 一瞬の美');
      lines.push('  のいずれかを差し込むと pacing が改善されます。');
    }

    if (repeated.length) {
      lines.push('');
      lines.push('🔁 【再使用回避】 直近で繰り返し使われた以下の文は再使用しないでください:');
      repeated.forEach(function (p) {
        lines.push('  ・ ' + (p.length > 40 ? p.slice(0, 40) + '…' : p));
      });
    }

    lines.push('');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('【重要】 上記は厳格な指示ではなく、創造性のための「種」です。');
    lines.push('使う / 一部だけ使う / 全く別の方向に進む — いずれも自由。');
    lines.push('既存の文脈と整合性を最優先してください。');
    lines.push('義務的に詰め込まず、自然に滲ませる方が良いです。');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');

    return lines.join('\n');
  }

  // === Wrap Planner.build ===
  function wrapPlanner() {
    if (typeof Planner !== 'object' || !Planner || typeof Planner.build !== 'function') return false;
    if (Planner.build.__v273Wrapped) return true;
    var orig = Planner.build.bind(Planner);
    Planner.build = function (inputType, inputText) {
      var r = orig(inputType, inputText);
      try {
        if (r && r.sys) {
          r.sys += '\n\n' + buildInspiration();
        }
      } catch (e) {
        console.warn('[v273] inject err:', e && e.message);
      }
      return r;
    };
    Planner.build.__v273Wrapped = true;
    console.log('[v273] Planner.build wrapped');
    return true;
  }

  wrapPlanner();
  var tries = 0;
  var iv = setInterval(function () {
    if (wrapPlanner() || ++tries > 30) clearInterval(iv);
  }, 500);

  window.__v273 = {
    buildInspiration: buildInspiration,
    pickThemes: pickThemes,
    pickVoice: pickVoice,
    detectToneStuck: detectToneStuck,
    extractRepeatedPhrases: extractRepeatedPhrases
  };

  console.log('[v273] init complete');
})();
