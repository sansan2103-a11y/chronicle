// v278-plain-japanese-and-narr-dedup.js
//
// 目的: Bug A 続編 — 「平易日本語」と「narrative 内重複セリフの除去」
//
// 観察された問題 (2026-05-09 v277 デプロイ後におしんさん報告):
//   1. 「内襞」「子宮奥」「膣洞」「蹂躙」「肥大化」「侵略」のような
//      Wikipedia 風造語・難読語が頻出して没入感を削ぐ
//   2. 「ーーーっ!! な、なにか……おおきいの…きてる！」のような同一セリフが
//      連続 2 回出る重複が見える
//
// 根本原因の判明:
//   v277 までは dedupe を `t.dialogues` 配列ベースで実装していたが、
//   実機 localStorage を観察すると **t.dialogues 配列は存在しない**。
//   セリフは `narrative` 単一文字列の中に「キャラ名「セリフ」」形式で
//   埋め込まれている。よって v217 / v277 の dedupeAcrossTurns は空振りしていた。
//
// 哲学:
//   - 「禁止」より「刺激」: 難語の置換ではなく、平易な語彙で書くよう
//     肯定文で誘導する
//   - 表現の自由とリアリティを最優先: 内容の検閲ではなく、語彙レベルの
//     可読性向上のみを目指す
//   - 「日常会話の語彙で書く方が、生身の感覚が伝わる」と伝える
//
// 動作:
//   A. Planner.build を wrap し、prompt の最後に
//      【平易日本語ガイダンス】を soft 注入
//   B. Planner.parsePlan を wrap し、parse 後の plan.narrative 配列に対して:
//      1) 同 turn 内で出現する「」セリフがカナ正規化で重複 → 後ろを削除
//      2) 直近 3 ターンの narrative にあった「」セリフ (カナ正規化一致)
//         を削除
//
// ガード: window.__v278Active

(function v278() {
  'use strict';
  if (window.__v278Active) return;
  window.__v278Active = true;
  console.log('[v278] plain-japanese-and-narr-dedup init');

  // ============================================================
  // カナ正規化 (v277 と同じロジック、v277 が無い場合の fallback)
  // ============================================================
  function normalizeKana(s) {
    if (window.__v277 && typeof window.__v277.normalizeKana === 'function') {
      return window.__v277.normalizeKana(s);
    }
    if (!s) return '';
    var t = String(s);
    t = t.replace(/[ァ-ヶ]/g, function (m) {
      return String.fromCharCode(m.charCodeAt(0) - 0x60);
    });
    var smallMap = {
      'ぁ':'あ','ぃ':'い','ぅ':'う','ぇ':'え','ぉ':'お',
      'っ':'つ','ゃ':'や','ゅ':'ゆ','ょ':'よ','ゎ':'わ'
    };
    t = t.replace(/[ぁぃぅぇぉっゃゅょゎ]/g, function (m) { return smallMap[m] || m; });
    t = t.replace(/[…\.…ー]+/g, '…');
    t = t.replace(/[〜～~∼∽]/g, '〜');
    t = t.replace(/\s+/g, '');
    t = t.replace(/[、。,，!?！？]/g, '');
    t = t.replace(/[「」『』""]/g, '');
    return t.trim().toLowerCase();
  }

  // ============================================================
  // A. 平易日本語ガイダンス
  // ============================================================
  function buildPlainJapaneseBlock() {
    return [
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━',
      '【平易日本語ガイダンス (没入感優先)】',
      '━━━━━━━━━━━━━━━━━━━━━━━━━',
      'narrative は **中学生でも読める日常的な語彙** で書いてください。',
      '文学性のために難読漢字や造語を選ぶより、生身の感覚が伝わる平易な語彙の方が',
      'リアリティと没入感が高まります。',
      '',
      '✅ 好ましい (平易・体感):',
      '  - 「内側」「奥」「中」「皮膚」「肉」「血」「息」「胸」「腹」「腰」',
      '  - 「裂ける」「広がる」「押される」「絡みつく」「滑る」「震える」',
      '  - 「踏みにじる」「壊す」「飲み込む」',
      '',
      '⚠ 避けたい (Wikipedia 風造語・医学辞典語・低頻度漢字):',
      '  - 「内襞」「膣洞」「子宮臭」「会陰」「肛門括約筋」のような医学/解剖用語',
      '  - 「蹂躙」「侵略」「肥大化」「凌辱」「淫蕩」のような難読・古風熟語',
      '  - 「悍ましい」「妖艶」「淫靡」「絢爛」のような硬い文学語',
      '  - 「〜ならんとす」「〜であろう」のような古文調',
      '',
      '描写の濃さ・残酷さ・性的明示性は維持して構いません。',
      '**変えるのは「語彙レベル」だけ**で、表現の自由度・リアリティ・哲学は維持。',
      '抽象的な比喩より、**生身で実感できる身体感覚**で書く。',
      '━━━━━━━━━━━━━━━━━━━━━━━━━'
    ].join('\n');
  }

  function wrapPlanner() {
    if (typeof Planner !== 'object' || !Planner || typeof Planner.build !== 'function') return false;
    if (Planner.build.__v278Wrapped) return true;
    var orig = Planner.build.bind(Planner);
    Planner.build = function (inputType, inputText) {
      var r = orig(inputType, inputText);
      try {
        if (r && r.sys) r.sys += '\n' + buildPlainJapaneseBlock();
      } catch (e) {
        console.warn('[v278] Planner inject err:', e && e.message);
      }
      return r;
    };
    Planner.build.__v278Wrapped = true;
    console.log('[v278] Planner.build wrapped');
    return true;
  }
  setTimeout(wrapPlanner, 0);
  setTimeout(wrapPlanner, 500);
  setTimeout(wrapPlanner, 2000);
  setTimeout(wrapPlanner, 5000);
  var tries = 0;
  var iv = setInterval(function () {
    if (wrapPlanner() || ++tries > 30) clearInterval(iv);
  }, 500);

  // ============================================================
  // B. Planner.parsePlan wrap: narrative 配列の重複セリフを除去
  // ============================================================

  // 過去ターンの narrative から「」セリフを抽出 (カナ正規化キー)
  function getRecentDialogueKeys() {
    var s; try { s = JSON.parse(localStorage.getItem('chr6') || '{}'); } catch (e) { return {}; }
    var turns = (s.turns || []).slice(-3);
    var keys = {};
    turns.forEach(function (t) {
      var narr = '';
      if (typeof t.narrative === 'string') narr = t.narrative;
      else if (Array.isArray(t.narrative)) narr = t.narrative.join('\n');
      var matches = narr.match(/「[^「」]{2,80}」/g) || [];
      matches.forEach(function (m) {
        var inner = m.replace(/^「|」$/g, '').trim();
        var key = normalizeKana(inner);
        if (key.length >= 2) keys[key] = inner;
      });
    });
    return keys;
  }

  // 1 つの narrative line から「」を抽出
  function extractDialogueKeysFromLine(line) {
    var matches = String(line || '').match(/「[^「」]{2,80}」/g) || [];
    return matches.map(function (m) {
      return normalizeKana(m.replace(/^「|」$/g, '').trim());
    }).filter(function (k) { return k.length >= 2; });
  }

  // line から特定の「」セリフを除去（カナ正規化キー一致）
  function stripDialogueFromLine(line, keysToStrip) {
    if (!keysToStrip || !keysToStrip.length) return line;
    var matches = String(line || '').match(/「[^「」]{2,80}」/g);
    if (!matches) return line;
    var out = line;
    matches.forEach(function (m) {
      var inner = m.replace(/^「|」$/g, '').trim();
      var key = normalizeKana(inner);
      if (keysToStrip.indexOf(key) > -1) {
        // セリフ「...」を消す。前後のキャラ名や続く動作と整合性が崩れるので
        // 「...」だけを「（同様の反応）」に置換する形で痕跡を残す
        out = out.split(m).join('');
        console.log('[v278] stripped repeat dialogue:', inner.slice(0, 30));
      }
    });
    // 連続空白の整理
    out = out.replace(/\s{2,}/g, ' ').trim();
    return out;
  }

  function dedupNarrative(narrativeArr) {
    if (!Array.isArray(narrativeArr)) return narrativeArr;
    var prevKeys = getRecentDialogueKeys();    // {key: original}
    var seenInThisTurn = {};
    var out = [];
    narrativeArr.forEach(function (line) {
      if (!line) return;
      var keysInLine = extractDialogueKeysFromLine(line);
      // 同 turn 内で既出のキーは strip
      var keysToStrip = [];
      keysInLine.forEach(function (k) {
        if (seenInThisTurn[k]) {
          keysToStrip.push(k);
        } else if (prevKeys[k]) {
          keysToStrip.push(k);
        } else {
          seenInThisTurn[k] = true;
        }
      });
      var processed = keysToStrip.length ? stripDialogueFromLine(line, keysToStrip) : line;
      // 行が「」だけで構成されてた場合、空に近くなる可能性がある
      if (processed && processed.replace(/[\s　]/g, '').length >= 2) {
        out.push(processed);
      } else {
        // 完全に空になったらこの line をスキップ (前後の line だけで成立するはず)
        console.log('[v278] skipped emptied narrative line');
      }
    });
    return out;
  }

  function wrapParsePlan() {
    if (typeof Planner !== 'object' || !Planner || typeof Planner.parsePlan !== 'function') return false;
    if (Planner.parsePlan.__v278Wrapped) return true;
    var orig = Planner.parsePlan.bind(Planner);
    Planner.parsePlan = function (rawText, inputType) {
      var plan = orig(rawText, inputType);
      try {
        if (plan && Array.isArray(plan.narrative)) {
          plan.narrative = dedupNarrative(plan.narrative);
          if (plan.narrative.length === 0) plan.narrative = ['…'];
        }
      } catch (e) {
        console.warn('[v278] parsePlan dedup err:', e && e.message);
      }
      return plan;
    };
    Planner.parsePlan.__v278Wrapped = true;
    console.log('[v278] Planner.parsePlan wrapped (narrative dedup)');
    return true;
  }
  setTimeout(wrapParsePlan, 0);
  setTimeout(wrapParsePlan, 500);
  setTimeout(wrapParsePlan, 2000);
  var tries2 = 0;
  var iv2 = setInterval(function () {
    if (wrapParsePlan() || ++tries2 > 30) clearInterval(iv2);
  }, 500);

  // ============================================================
  // API
  // ============================================================
  window.__v278 = {
    normalizeKana: normalizeKana,
    buildPlainJapaneseBlock: buildPlainJapaneseBlock,
    getRecentDialogueKeys: getRecentDialogueKeys,
    dedupNarrative: dedupNarrative
  };

  console.log('[v278] init complete');
})();
