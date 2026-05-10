// v286c-blank-prefix-fix.js
// 目的: v108 が「性別: 女性。」を pre-fill した「実質空」フィールドを
//       v286 の expand パイプラインに巻き込めるようにする。
//
// 観測 (2026-05-10 実機検証):
//   完全リセット後、NPC[0] desc に「呪われた少女」種を入力 → 🎲 → NPC[0] は
//   72 字に展開された (✅) が、種未入力の NPC[1] desc は 「性別: 女性。」のまま (❌)
//
// 原因 (v286-seed-expansion.js / v284-random-lore-aware.js を読んだ結果):
//   1. v284.snapshotBlanks() は val('cfgHDesc') / data-f="desc" の生値を見て
//      「空文字列なら blank=true、何か入っていれば blank=false」と判定する。
//   2. v108 が pre-fill した「性別: 女性。」は val として「非空」なので
//      blank=false (= 既入力扱い) になる。
//   3. v286.clearGenderPlaceholders は blank=true のフィールドだけを field 値クリア
//      するため、v108 の prefix-only な「実質空」フィールドには触らない。
//   4. v286.getNpcDescSeed は blank=false かつ stripGenderPrefix 後の seed を返す
//      → "性別: 女性。" → 空文字列 → seed なし。
//   5. v286.shouldExpandNpcDesc は seed が空 → false。
//   6. v286.shouldWriteNpcDesc は (blank=false) || (expand=false) = false
//      → ask に含まれず、LLM 生成対象から外れる。何も書かれない。
//
// 修正:
//   window.__v284.snapshotBlanks を wrap し、戻り値の hDesc / npcs[i].desc を
//   再判定する:
//     - 元値が false (既入力扱い) でも、対応する field を読み出して
//       stripGenderPrefix した結果が空なら true (= 実質空) に書き換える。
//   これにより v286 の clearGenderPlaceholders → ask → applyResult の
//   パイプライン全体が「空欄 + 自由発明」モードで動く。
//
//   このアプローチの利点:
//   - 1 箇所の wrap だけで v286 内の他の関数 (listAskFields / shouldWriteNpcDesc /
//     applyResult / findThinDescs) すべてが整合的に動く
//   - 種ありフィールド (例: 「呪われた少女」が入った NPC[0]) は stripGenderPrefix
//     で残値があるため触らない → v286b の expand pipeline はそのまま動く
//   - v286 の関数を直接書き換えないため、v286 内部リファクタへの追従が容易
//
// チェーン:
//   UI.randomFill (v286 wrapper)
//     → window.__v284.snapshotBlanks() (= v286c wrapper)
//       → v284 の orig snapshotBlanks
//
// 既存ファイル v286-seed-expansion.js / v286b-seed-expansion-fix.js は触らない。
//
// ガード: window.__v286cActive

(function v286c(){
  'use strict';
  if (window.__v286cActive) return;
  window.__v286cActive = true;
  console.log('[v286c] blank-prefix-fix init');

  // 「性別: ◯。」のみ (本文ゼロ) を表す regex
  var GENDER_PREFIX_ONLY_RE = /^\s*性別\s*[:：]\s*[^。\n]*。?\s*$/;

  function stripGenderPrefix(s){
    return String(s || '').replace(/^性別\s*[:：]\s*[^。\n]*。\s*/, '').trim();
  }

  // 「実質空」: 完全に空 OR 「性別: ◯」だけ OR prefix を取った後に何も残らない
  function isEffectivelyBlank(s){
    if (!s) return true;
    var t = String(s).trim();
    if (!t) return true;
    if (GENDER_PREFIX_ONLY_RE.test(t)) return true;
    if (!stripGenderPrefix(t)) return true;
    return false;
  }

  function val(id){
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function patchSnapshot(){
    if (!window.__v284 || typeof window.__v284.snapshotBlanks !== 'function') return false;
    if (window.__v284.snapshotBlanks.__v286cWrapped) return true;

    var orig = window.__v284.snapshotBlanks;
    var wrapped = function(){
      var blank = orig.apply(this, arguments);
      if (!blank) return blank;
      var rewriteCount = 0;

      // hero.desc
      if (!blank.hDesc){
        var hdesc = val('cfgHDesc');
        if (isEffectivelyBlank(hdesc)){
          blank.hDesc = true;
          rewriteCount++;
          console.log('[v286c] hero.desc effectively blank (gender-prefix-only) →  forcing blank=true');
        }
      }

      // npc[i].desc
      var cards = document.querySelectorAll('#npcList .npc-card');
      if (Array.isArray(blank.npcs)){
        blank.npcs.forEach(function(b, i){
          if (!b || b.desc) return;       // 既に blank=true なら触らない
          var card = cards[i];
          if (!card) return;
          var dc = card.querySelector('[data-f="desc"]');
          if (!dc) return;
          var v = (dc.value || '').trim();
          if (isEffectivelyBlank(v)){
            b.desc = true;
            rewriteCount++;
            console.log('[v286c] npc[' + i + '].desc effectively blank (gender-prefix-only) → forcing blank=true');
          }
        });
      }

      if (rewriteCount){
        console.log('[v286c] rewrote', rewriteCount, 'fields blank=true (effective blank detection)');
      }
      return blank;
    };
    wrapped.__v286cWrapped = true;
    window.__v284.snapshotBlanks = wrapped;
    console.log('[v286c] __v284.snapshotBlanks wrapped');
    return true;
  }

  if (!patchSnapshot()){
    var tries = 0;
    var iv = setInterval(function(){
      if (patchSnapshot() || ++tries > 60) clearInterval(iv);
    }, 500);
  }

  // === Public API ===
  window.__v286c = {
    isEffectivelyBlank: isEffectivelyBlank,
    stripGenderPrefix: stripGenderPrefix,
    GENDER_PREFIX_ONLY_RE: GENDER_PREFIX_ONLY_RE
  };

  console.log('[v286c] init complete');
})();
