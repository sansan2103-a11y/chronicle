// v277-anti-dup-and-soft-pivot.js
// 目的: Bug A (重複セリフ + 不連続なシーンジャンプ) の解消
//
// 観察された問題 (2026-05-09 おしんさん報告):
//   1. ターン跨ぎで似たセリフが反復 (微変動 ぁ↔ァ で v217 / v273 の検出をすり抜け)
//   2. 数ターン暗いシーンが続いた末に「廊下に子供達と先生」「大通りで銃声」など
//      不連続な新シーン要素が突然挿入される
//
// 原因:
//   1. Planner.build が writer LLM に直近 6 ターンの narrative を生テキストで渡しており、
//      Hermes がそこに含まれる「」セリフを見て同じものを再生成。
//      v217 / v273 の重複検出は完全一致のみで、微変動 (ぁ↔ァ, ぃ↔ェ, …↔.) はすり抜ける。
//   2. 「進行強要」が複層的に prompt に積まれている:
//      - all-in-one wrapper: 「毎ターン状況を一段階進める」
//      - v273: 暗いシーン4連続で「別人物の優しさ」を提案 ← 子供達+先生の出所
//      - v275: stuckPattern 警告 + nextTurnHint の継続注入
//      これらが累積し、LLM が「全く別のシーン要素を導入」する形で暴発する。
//
// 哲学 (CLAUDE_RULES.md より):
//   - 「制約より刺激」: 禁止追加ではなく、別角度の刺激として書く
//   - メタ視点 (アーク・観客) は v275 / 内面は v276 / 重複・展開連続性は v277 (本パッチ)
//
// 動作:
//   A. Planner.build を最後に wrap し、prompt の最後に
//      「直近で実際に発話されたセリフ一覧 (再使用回避)」を追加
//      - 完全一致だけでなくカナ正規化後の重複も検出
//      - 「同じ感情でも別の語彙・身体感覚・視点から書く」という肯定的指示を添える
//   B. v273.buildInspiration を wrap し、pacing 提案の「別人物の優しさ」を
//      「現在のシーン内での空気の変化 (光・音・匂い・温度・沈黙)」に置換
//   C. 「唐突な場所・新登場人物の導入は、前ターンと自然に繋がる場合のみ」の soft 注意を追加
//   D. v217 の dedupeAcrossTurns を補強し、カナ正規化後の重複も削除する
//
// ガード: window.__v277Active

(function v277() {
  'use strict';
  if (window.__v277Active) return;
  window.__v277Active = true;
  console.log('[v277] anti-dup-and-soft-pivot init');

  // ============================================================
  // 0. ユーティリティ: カナ正規化
  // ============================================================
  // ぁ↔ァ, ぃ↔ェ, … vs ... vs 〜 などの微変動を吸収する
  function normalizeKana(s) {
    if (!s) return '';
    var t = String(s);
    // 全角カタカナ → ひらがな
    t = t.replace(/[ァ-ヶ]/g, function (m) {
      return String.fromCharCode(m.charCodeAt(0) - 0x60);
    });
    // 小書き仮名 → 大書き仮名 (ぁ→あ, ぃ→い ...)
    var smallMap = {
      'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お',
      'っ': 'つ', 'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ', 'ゎ': 'わ'
    };
    t = t.replace(/[ぁぃぅぇぉっゃゅょゎ]/g, function (m) {
      return smallMap[m] || m;
    });
    // 連続三点リーダ・ピリオド・波ダッシュ揺れを統一
    t = t.replace(/[…\.…]+/g, '…');
    t = t.replace(/[〜～~∼∽]/g, '〜');
    // 空白統一
    t = t.replace(/\s+/g, '');
    // 句読点
    t = t.replace(/[、。,，]/g, '');
    // 括弧揺れ
    t = t.replace(/[「」『』""「」]/g, '');
    return t.trim().toLowerCase();
  }

  // ============================================================
  // 1. 直近セリフ抽出 (narrative + dialogues 両方から)
  // ============================================================
  function getRecentDialogues() {
    var s;
    try { s = JSON.parse(localStorage.getItem('chr6') || '{}'); } catch (e) { return []; }
    var turns = (s.turns || []).slice(-3);
    var collected = [];

    turns.forEach(function (t, ti) {
      // 1) narrative の中から「」を抽出
      var narr = '';
      if (typeof t.narrative === 'string') {
        narr = t.narrative;
      } else if (Array.isArray(t.narrative)) {
        narr = t.narrative.join('\n');
      }
      var dlgs = narr.match(/「([^「」]{4,60})」/g) || [];
      dlgs.forEach(function (m) {
        var text = m.replace(/^「|」$/g, '').trim();
        if (text) collected.push({ text: text, turn: ti });
      });

      // 2) 構造化された dialogues 配列
      var arr = Array.isArray(t.dialogues) ? t.dialogues
              : Array.isArray(t.lines)     ? t.lines
              : Array.isArray(t.dialogue)  ? t.dialogue
              : [];
      arr.forEach(function (d) {
        if (d && (d.text || d.line)) {
          var who = d.speaker || d.who || '';
          var text = (d.text || d.line || '').trim();
          if (text) collected.push({ text: text, who: who, turn: ti });
        }
      });
    });

    // カナ正規化キーで重複除去 (= 微変動でも 1 件に集約)
    var seen = {};
    var uniq = [];
    collected.forEach(function (c) {
      var key = normalizeKana(c.text);
      if (!key || seen[key]) return;
      seen[key] = true;
      uniq.push(c);
    });
    // 直近を優先するため逆順
    return uniq.slice(-12);
  }

  // ============================================================
  // 2. Planner.build wrap: 「直近セリフ一覧」を soft に注入
  // ============================================================
  function buildAvoidBlock() {
    var dlgs = getRecentDialogues();
    if (!dlgs.length) return '';
    var lines = [];
    lines.push('');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('【直近で実際に発話されたセリフ (連続再生成を回避)】');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
    dlgs.forEach(function (d) {
      var who = d.who ? d.who + ': ' : '';
      var text = d.text.length > 50 ? d.text.slice(0, 50) + '…' : d.text;
      lines.push('  ・ ' + who + '「' + text + '」');
    });
    lines.push('');
    lines.push('上記は直近 3 ターン以内に既に発話されたセリフです。');
    lines.push('同じ感情を表現する場合でも、以下の方向で**別の角度から**書いてください:');
    lines.push('  ・ 別の身体感覚 (口の渇き / 視界の歪み / 指先の冷え / 呼吸の止まり)');
    lines.push('  ・ 別の語彙 (「やめて」→「行かないで」「離して」「触らないで」「もう」)');
    lines.push('  ・ セリフではなく沈黙・吐息・震え・行動で表現');
    lines.push('  ・ 三人称的な観察 (「私、震えてるな」のように自分を遠くから見る)');
    lines.push('');
    lines.push('上記セリフの**微変動 (小書き仮名や記号だけ変えた変形) も再使用とみなします**。');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━');
    return lines.join('\n');
  }

  function buildSoftPivotBlock() {
    return [
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━',
      '【シーン連続性ガイダンス】',
      '━━━━━━━━━━━━━━━━━━━━━━━━━',
      '直近の場所・登場人物は維持してください。',
      '',
      '✅ OK: 現在のシーン内での空気の変化',
      '  - 光や影の動き / 音の有無 / 匂いの変化 / 温度感 / 沈黙の質',
      '  - 既出キャラの新しい一面・動作・呼吸・視線',
      '  - 同じ場所での時間経過 (数秒・数分)',
      '',
      '⚠ 唐突な切り替えは前ターンと**因果的に繋がっている時のみ**:',
      '  - 新しい場所への移動 (誰がどう動いたか描かずに場所が変わるのは NG)',
      '  - 新しい登場人物の唐突な乱入 (足音・ドア音など導入なしに突然現れない)',
      '  - 全く別ジャンルへの飛躍 (ホラー → 銃撃戦 など)',
      '',
      '前ターンが暗くて重い場合でも、無理に明るい要素を投入せず、',
      '同じ場所・同じ登場人物の中で**質感の変化**で pacing を調整してください。',
      '━━━━━━━━━━━━━━━━━━━━━━━━━'
    ].join('\n');
  }

  function wrapPlanner() {
    if (typeof Planner !== 'object' || !Planner || typeof Planner.build !== 'function') return false;
    if (Planner.build.__v277Wrapped) return true;
    var orig = Planner.build.bind(Planner);
    Planner.build = function (inputType, inputText) {
      var r = orig(inputType, inputText);
      try {
        if (r && r.sys) {
          var avoid = buildAvoidBlock();
          if (avoid) r.sys += '\n' + avoid;
          r.sys += '\n' + buildSoftPivotBlock();
        }
      } catch (e) {
        console.warn('[v277] Planner inject err:', e && e.message);
      }
      return r;
    };
    Planner.build.__v277Wrapped = true;
    console.log('[v277] Planner.build wrapped (last)');
    return true;
  }
  // 他のすべての wrap (v273/v275/v276/all-in-one) の後に被せたいので少し遅らせる
  setTimeout(wrapPlanner, 0);
  setTimeout(wrapPlanner, 500);
  setTimeout(wrapPlanner, 2000);
  setTimeout(wrapPlanner, 5000);
  var tries = 0;
  var iv = setInterval(function () {
    if (wrapPlanner() || ++tries > 30) clearInterval(iv);
  }, 500);

  // ============================================================
  // 3. v273.buildInspiration の文言を soft pivot 寄りに置換
  // ============================================================
  function patchV273() {
    if (!window.__v273 || typeof window.__v273.buildInspiration !== 'function') return false;
    if (window.__v273.buildInspiration.__v277Patched) return true;
    var origBuild = window.__v273.buildInspiration;

    window.__v273.buildInspiration = function () {
      var raw = origBuild();
      if (!raw) return raw;
      // 「別人物の優しさ」「諧謔」を「現在のシーン内の質感変化」に置換
      // pacing 提案ブロックの本文を控えめに
      var patched = raw
        // 「pacing 提案」の選択肢から「別人物の優しさ」を削除
        .replace(
          /今ターンは: 静寂 \/ 微かな希望 \/ 別人物の優しさ \/ 諧謔 \/ 一瞬の美/g,
          '今ターンは現在のシーン内で: 沈黙 / 光や影の微変化 / 音の遠近 / 匂いの記憶 / 呼吸の質変化\n  のいずれかで pacing を変えると整います (新しい場所・人物の唐突導入は避ける)'
        )
        // 主人公の内心モード「諧謔」(黒い笑い・冷笑) を提案するときは「シーン内で」と添える
        .replace(
          /🎙️ 主人公の内心モード提案:/g,
          '🎙️ 主人公の内心モード提案 (現在のシーン内で表現):'
        );
      return patched;
    };
    window.__v273.buildInspiration.__v277Patched = true;
    console.log('[v273] buildInspiration patched by v277');
    return true;
  }
  setTimeout(patchV273, 0);
  setTimeout(patchV273, 500);
  setTimeout(patchV273, 2000);
  var tries2 = 0;
  var iv2 = setInterval(function () {
    if (patchV273() || ++tries2 > 30) clearInterval(iv2);
  }, 500);

  // ============================================================
  // 4. v217 の dedupeAcrossTurns 強化: カナ正規化後の重複も削除
  // ============================================================
  function patchV217() {
    if (!window.__v217 || typeof window.__v217.dedupeAcrossTurns !== 'function') return false;
    if (window.__v217.dedupeAcrossTurns.__v277Patched) return true;
    var origDedupe = window.__v217.dedupeAcrossTurns;

    window.__v217.dedupeAcrossTurns = function (turns) {
      // まず元の完全一致 dedupe
      var changedExact = origDedupe(turns);

      // 続けてカナ正規化版 dedupe
      if (!turns || turns.length < 2) return changedExact;
      var prev = turns[turns.length - 2];
      var curr = turns[turns.length - 1];
      if (!prev || !curr) return changedExact;
      if (!Array.isArray(prev.dialogues) || !Array.isArray(curr.dialogues)) return changedExact;

      var prevSigs = {};
      prev.dialogues.forEach(function (d) {
        if (!d) return;
        var key = (d.speaker || '') + '||' + normalizeKana(d.text || '');
        if (key.length > 3) prevSigs[key] = true;
      });
      var changedNorm = false;
      var newDlg = curr.dialogues.filter(function (d) {
        if (!d) return false;
        var key = (d.speaker || '') + '||' + normalizeKana(d.text || '');
        if (prevSigs[key]) {
          console.log('[v277] dup cross-turn (kana-norm):', d.speaker, (d.text || '').substring(0, 30));
          changedNorm = true;
          return false;
        }
        return true;
      });
      if (changedNorm) curr.dialogues = newDlg;
      return changedExact || changedNorm;
    };
    window.__v217.dedupeAcrossTurns.__v277Patched = true;
    console.log('[v217] dedupeAcrossTurns enhanced by v277 (kana-norm)');
    return true;
  }
  setTimeout(patchV217, 0);
  setTimeout(patchV217, 500);
  setTimeout(patchV217, 2000);
  var tries3 = 0;
  var iv3 = setInterval(function () {
    if (patchV217() || ++tries3 > 30) clearInterval(iv3);
  }, 500);

  // ============================================================
  // API
  // ============================================================
  window.__v277 = {
    normalizeKana: normalizeKana,
    getRecentDialogues: getRecentDialogues,
    buildAvoidBlock: buildAvoidBlock,
    buildSoftPivotBlock: buildSoftPivotBlock
  };

  console.log('[v277] init complete');
})();
