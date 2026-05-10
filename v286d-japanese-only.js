// v286d-japanese-only.js
// 目的: v286 の seed-expansion プロンプトに「日本語のみで出力」を強く明記し、
//       v211 の「外国語混入を検出 → 再生成」リトライ頻度を下げる。
//
// 観測 (2026-05-10 実機検証):
//   ランダム生成で毎回 `[Retry 1/2] 外国語混入を検出、再生成します` が走り、
//   40 秒待たされる (Hermes 4 が中文/英語混ざりの応答を返すため)。
//
// 修正:
//   A. window.__v286.buildSeedPrompt を wrap し、sys 末尾に「日本語のみ」セクションを追加
//   B. retry 用の buildRetryPrompt は v286 内に閉じている (export 無し) ので
//      この addendum は seed pass のみ。retry はそのまま。
//      (retry が走る原因の元 pass で日本語率を上げれば、retry 自体が減るはず)
//
// チェーン (install 後):
//   buildSeedPrompt = v286d wrapper
//     → v286b wrapper (user に expand addendum)
//       → orig v286.buildSeedPrompt
//
//   v286d は最後に install されるため、orig + v286b の上に「日本語のみ」が
//   sys 末尾に追加される。
//
// 注意:
//   - JSON のキー名 (scene, hero, name, desc 等) は英語のままが正しい仕様 → 例外として明示
//   - 日本語の固有名詞 (キャラ名、地名のカタカナ表記) は許容
//
// 既存ファイル v286-seed-expansion.js / v286b-seed-expansion-fix.js は触らない。
//
// ガード: window.__v286dActive

(function v286d(){
  'use strict';
  if (window.__v286dActive) return;
  window.__v286dActive = true;
  console.log('[v286d] japanese-only init');

  function buildJpAddendum(){
    return [
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━',
      '【⚠ 言語指定 — 厳守 (v286d)】',
      '━━━━━━━━━━━━━━━━━━━━━━━━━',
      '出力 JSON の **値の文字列** は全て **日本語のみ** で書く。',
      '',
      '【絶対禁止】',
      '・英単語・英文の混入',
      '   ❌ "Hero stands in the city of mist." ',
      '   ❌ "彼女は the kingdom の戦士..." ',
      '・中国語簡体字・繁体字の混入 (中国語特有の表現や漢字表記)',
      '   ❌ "她是勇者..." (「她」は中国語の女性三人称)',
      '   ❌ "城市", "勇者" (中国語的な表現)',
      '・韓国語の混入',
      '   ❌ "용사", "그녀는..."',
      '・タイ語、ロシア語、ベトナム語、その他外国語',
      '',
      '【許容】',
      '・JSON のキー名 ("scene", "hero", "name", "desc", "lore", "loc", "obj", "tone", "npcs") は元のまま英語',
      '・日本語ネイティブな漢字 (常用漢字 + 一般的な人名漢字)、カタカナ、ひらがな',
      '・カタカナ固有名詞 (キャラ名「ミコト」、地名「アルテラ」など)',
      '・句読点は和文記号 (、。「」『』) を使う',
      '',
      '【自己チェック】',
      '出力前に必ず一度読み直し、英文・中国語簡体繁体字・ハングル等が混じっていないか確認すること。',
      '混入があれば全て日本語に置き換えてから JSON を出力する。',
      '',
      '※ 万が一外国語が混じっていた場合、自動リトライが発生し時間が余計にかかる。',
      '━━━━━━━━━━━━━━━━━━━━━━━━━'
    ].join('\n');
  }

  function patchV286(){
    if (!window.__v286 || typeof window.__v286.buildSeedPrompt !== 'function') return false;
    if (window.__v286.__v286dPatched) return true;

    var origBuild = window.__v286.buildSeedPrompt;
    window.__v286.buildSeedPrompt = function(blank){
      var pr = origBuild(blank);
      if (!pr) return pr;
      pr.sys = pr.sys + '\n' + buildJpAddendum();
      return pr;
    };
    window.__v286.__v286dPatched = true;
    console.log('[v286d] v286.buildSeedPrompt wrapped (japanese-only addendum)');
    return true;
  }

  if (!patchV286()){
    var tries = 0;
    var iv = setInterval(function(){
      if (patchV286() || ++tries > 60) clearInterval(iv);
    }, 500);
  }

  // === Public API ===
  window.__v286d = {
    buildJpAddendum: buildJpAddendum
  };

  console.log('[v286d] init complete');
})();
