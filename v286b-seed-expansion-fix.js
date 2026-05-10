// v286b-seed-expansion-fix.js
// 目的: v286 の seed expansion が機能していなかった問題を修正
//
// 観測 (おしんさん 2026-05-10 報告):
//   種「呪われた少女」を NPC desc に入力 → 🎲 → 結果が「性別: 女性。呪われた少女」
//   のまま (16 字、種そのまま)
//   別 NPC ユキは「性別: 女性。幽霊のように佇む女子生徒。その姿からは未練が漂う」
//   (約 30 字、ぎりぎりだが 50 字未満)
//   いずれも v286 の意図 (50〜120 字に膨らませる) を満たしていない。
//
// 原因 (v286-seed-expansion.js を読んだ結果):
//   1. expand プロンプトが「50〜120 字」と指示はしているが、user message 末尾に
//      重ねて言わないので Hermes 4 が忘れる。
//   2. NG 例 (verbatim 禁止) が無いので、LLM が「種をそのまま返す」失敗パターンを
//      取りがち。
//   3. findThinDescs が isThinDesc (< 30 chars) を使うため、35 字くらいの中途半端な
//      返答が「OK」になり retry が走らない。expand 対象なら 50 字未満を thin と
//      みなすべき。
//   4. seed verbatim を含むだけで length 未達のケースを捕捉していない。
//
// 修正:
//   A. window.__v286.buildSeedPrompt を wrap、user message 末尾に
//      「verbatim 禁止 + NG/OK 例 + 50字最低」を追記 (recency bias 最大化)
//   B. window.__v286.findThinDescs を wrap、expand 対象は <50 chars もしくは
//      seed verbatim 含有を thin と判定 → retry が確実に走る
//
// 既存ファイル v286-seed-expansion.js は触らない (HANDOFF §6 「既存スクリプトの
// 大幅な書き換え」回避)。
//
// ガード: window.__v286bActive

(function v286b(){
  'use strict';
  if (window.__v286bActive) return;
  window.__v286bActive = true;
  console.log('[v286b] seed-expansion-fix init');

  var EXPAND_MIN_CHARS = 50;  // expand 対象でこれ未満は thin
  var BARELY_EXPANDED_RATIO = 1.8;  // seed の 1.8 倍未満なら膨らんでいない

  // === Build addendum (user 末尾に挟む 強化指示) ===
  function buildExpandAddendum(){
    return [
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━',
      '【⚠ 種展開の最終確認 — 厳守 (v286b)】',
      '━━━━━━━━━━━━━━━━━━━━━━━━━',
      '「種を膨らませるフィールド」に対する出力ルール:',
      '',
      '  ❌ NG 例 (これは失敗とみなす — 必ず避ける):',
      '    種「呪われた少女」 → desc「呪われた少女」      ← verbatim コピー',
      '    種「呪われた少女」 → desc「呪われた少女。」    ← 一文字足しただけ',
      '    種「呪われた少女」 → desc「彼女は呪われた少女。」← 短すぎ (50字未満)',
      '    種「幽霊のような女子生徒」 → desc「幽霊のような女子生徒」 ← 同上',
      '',
      '  ✅ OK 例 (合格ライン):',
      '    種「呪われた少女」 → desc「16歳、左目に呪印を持つ寡黙な少女。',
      '       母方に伝わる呪いを断ち切るため、一人で旅立った。瞳の奥に',
      '       静かな決意が宿る」(50 字以上、種のキーワード「呪い」「少女」を保持)',
      '',
      '    種「幽霊のような女子生徒」 → desc「制服姿のまま放課後の校舎に',
      '       佇む幽霊のような女子生徒。声は小さく、体温も感じられず、',
      '       周囲に未練と諦念の気配が漂う」(50字以上、キーワード保持)',
      '',
      '  📏 最低文字数: hero.desc は 50 文字、npc.desc も 50 文字。',
      '       それ未満の出力は失格扱い。',
      '',
      '  🎯 種のキーワードは保持: 種「呪われた少女」なら desc 内に「呪い」+',
      '       「少女」を含める。種「幽霊のような女子生徒」なら「幽霊」+',
      '       「女子生徒」を含める。',
      '',
      '  📝 verbatim (種の文字列をそのまま新 desc に丸写し) は禁止。',
      '       新 desc は種を「中核に持ちつつ書き直す」こと。',
      '━━━━━━━━━━━━━━━━━━━━━━━━━'
    ].join('\n');
  }

  function patchV286(){
    if (!window.__v286 || typeof window.__v286.buildSeedPrompt !== 'function') return false;
    if (window.__v286.__v286bPatched) return true;
    if (typeof window.__v286.findThinDescs !== 'function') return false;

    var origBuildPrompt = window.__v286.buildSeedPrompt;
    var origFindThin = window.__v286.findThinDescs;
    var getHeroSeed = window.__v286.getHeroDescSeed;
    var getNpcSeed = window.__v286.getNpcDescSeed;
    var shouldExpandH = window.__v286.shouldExpandHDesc;
    var shouldExpandN = window.__v286.shouldExpandNpcDesc;

    // --- A. buildSeedPrompt 強化 ---
    window.__v286.buildSeedPrompt = function(blank){
      var pr = origBuildPrompt(blank);
      if (!pr) return pr;
      // expand 対象が無ければ追記不要
      var expand = window.__v286.listExpandFields ? window.__v286.listExpandFields(blank) : [];
      if (!expand || !expand.length) return pr;
      pr.user = pr.user + '\n' + buildExpandAddendum();
      return pr;
    };

    // --- B. findThinDescs 強化 ---
    function stripPrefix(s){
      return String(s || '').replace(/^性別\s*[:：]\s*[^。\n]*。\s*/, '').trim();
    }

    window.__v286.findThinDescs = function(blank, parsed){
      var thin = origFindThin(blank, parsed) || [];

      function addIfThin(field, descVal, seed){
        if (thin.indexOf(field) >= 0) return;
        var stripped = stripPrefix(descVal);
        if (!stripped){
          thin.push(field);
          console.log('[v286b] thin (empty):', field);
          return;
        }
        if (stripped.length < EXPAND_MIN_CHARS){
          thin.push(field);
          console.log('[v286b] thin (< ' + EXPAND_MIN_CHARS + ' chars):', field, 'len=', stripped.length);
          return;
        }
        if (seed){
          if (stripped === seed){
            thin.push(field);
            console.log('[v286b] thin (seed verbatim):', field);
            return;
          }
          if (seed.length > 2 && stripped.length < seed.length * BARELY_EXPANDED_RATIO){
            thin.push(field);
            console.log('[v286b] thin (barely expanded):', field, 'seed=', seed.length, 'desc=', stripped.length);
            return;
          }
        }
      }

      // hero.desc
      if (typeof shouldExpandH === 'function' && shouldExpandH(blank)){
        var hd = (parsed && parsed.hero && parsed.hero.desc) || '';
        if (!hd){
          var hEl = document.getElementById('cfgHDesc');
          hd = hEl ? hEl.value.trim() : '';
        }
        addIfThin('hero.desc', hd, getHeroSeed && getHeroSeed(blank));
      }

      // npc[i].desc
      blank.npcs.forEach(function(b, i){
        if (typeof shouldExpandN === 'function' && shouldExpandN(blank, i)){
          var pNpcs = (parsed && parsed.npcs && Array.isArray(parsed.npcs)) ? parsed.npcs : [];
          var nd = (pNpcs[i] && pNpcs[i].desc) || '';
          if (!nd){
            var card = document.querySelectorAll('#npcList .npc-card')[i];
            if (card){
              var dc = card.querySelector('[data-f="desc"]');
              nd = dc ? dc.value.trim() : '';
            }
          }
          addIfThin('npcs[' + i + '].desc', nd, getNpcSeed && getNpcSeed(blank, i));
        }
      });

      return thin;
    };

    window.__v286.__v286bPatched = true;
    console.log('[v286b] v286 patched (expand prompt + thin detection raised to ' + EXPAND_MIN_CHARS + ')');
    return true;
  }

  if (!patchV286()){
    var tries = 0;
    var iv = setInterval(function(){
      if (patchV286() || ++tries > 60) clearInterval(iv);
    }, 500);
  }

  // === Public API ===
  window.__v286b = {
    EXPAND_MIN_CHARS: EXPAND_MIN_CHARS,
    BARELY_EXPANDED_RATIO: BARELY_EXPANDED_RATIO,
    buildExpandAddendum: buildExpandAddendum
  };
  console.log('[v286b] init complete');
})();
