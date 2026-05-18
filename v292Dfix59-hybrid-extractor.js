// =====================================================================
// Chronicle TRPG — v292Dfix59: hybrid dialogue extractor (tag + quote fallback)
// ------------------------------------------------------------------------
// 目的:
//   fix58 で Hermes に <say who="..."> タグ出力を指示。fix59 はこのタグを
//   会話ログ抽出器の最優先ソースにする。タグから抽出した speaker は
//   100% 確定。タグを忘れた場合は、既存の引用符ベース抽出器
//   (extractDialoguesEnhanced + fix57 script 体) に fallback する。
//
// 設計:
//   1. narrative から <say who="X">text</say> を全部拾う（速い、決定論）
//   2. narrative から <say> 全削除して「クリーンな」テキストにする
//   3. クリーン版を既存 extractor に通す → 引用符ベース・script 体ベースの抽出
//   4. tag 抽出（優先） + 既存抽出（fallback） を speaker+text ハッシュで merge
//
//   ★ fix57 の機能は wrap 順序で自動的に内包される
//      (orig → fix57 wraps → fix59 wraps over fix57's wrapper)
//
// 副次効果:
//   - 混戦シーンでも speaker 帰属が確実
//   - 「謎の声」「？」「キャラ名(心)」も speaker として記録される
//   - 既存の Pattern A-H 抽出はクリーンテキストに対して動くので副作用なし
//
// 使う hook:
//   window.__v292.dialogueLayout.extractDialogues を wrap
// =====================================================================
(function(){
  if (window.__v292Dfix59Active) return;
  window.__v292Dfix59Active = true;
  var TAG = '[v292Dfix59]';

  // <say who="X">text</say> を全部抽出。strippedNarrative は tag 除去後のテキスト。
  function extractSayTags(narrative){
    var out = [];
    if (!narrative) return { extracted: out, strippedNarrative: '' };
    var s = String(narrative);

    // summary タグも先に除去（fix58 parseExt の保険）
    s = s.replace(/<summary>[\s\S]*?<\/summary>/g, '');
    s = s.replace(/<summary>[\s\S]*$/g, '');

    // say タグ抽出
    var rx = /<say\s+who="([^"]*)"\s*>([\s\S]*?)<\/say>/g;
    var m;
    while ((m = rx.exec(s)) !== null){
      var speaker = (m[1] || '').trim();
      var text = (m[2] || '').trim();
      if (speaker && text){
        out.push({ speaker: speaker, text: text, source: 'v292Dfix59-tag' });
      }
    }

    // tag を完全除去したクリーン版を作る
    var clean = s
      .replace(rx, '')  // 完全な <say>...</say> ペア
      .replace(/<say\s+who="[^"]*"\s*>/g, '')  // 未閉じの開始タグ
      .replace(/<\/say>/g, '')  // 余分な閉じタグ
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return { extracted: out, strippedNarrative: clean };
  }

  function mergeUnique(arrays){
    var seen = Object.create(null);
    var out = [];
    for (var a = 0; a < arrays.length; a++){
      var arr = arrays[a] || [];
      for (var i = 0; i < arr.length; i++){
        var d = arr[i];
        if (!d || !d.text) continue;
        var k = (d.speaker || '') + '|' + d.text;
        if (seen[k]) continue;
        seen[k] = true;
        out.push(d);
      }
    }
    return out;
  }

  function tryWrap(){
    var dl = window.__v292 && window.__v292.dialogueLayout;
    if (!dl || typeof dl.extractDialogues !== 'function'){
      setTimeout(tryWrap, 300);
      return;
    }
    if (dl.__v292Dfix59Wrapped) return;

    var orig = dl.extractDialogues;
    var wrapped = function(narrSrc, turn){
      try {
        var narrative = Array.isArray(narrSrc) ? narrSrc.join('\n') : String(narrSrc || '');
        var result = extractSayTags(narrative);
        // 既存 extractor（fix57 まで適用済み）をクリーン版に対して呼ぶ
        var origResult = orig.call(this, result.strippedNarrative, turn) || [];
        // tag 抽出を優先、既存抽出を fallback として merge
        var merged = mergeUnique([result.extracted, origResult]);
        if (result.extracted.length > 0){
          console.log(TAG, 'say-tag extracted:', result.extracted.length,
                     '+ legacy:', origResult.length, '= total:', merged.length);
        }
        return merged;
      } catch(e){
        console.warn(TAG, 'wrap error:', e && e.message);
        return orig.call(this, narrSrc, turn);
      }
    };

    dl.extractDialogues = wrapped;
    // 旧 dfix15 経由参照も差し替え
    if (window.__v292.dfix15 && typeof window.__v292.dfix15.extractDialogues === 'function'){
      window.__v292.dfix15.extractDialogues = wrapped;
    }
    dl.__v292Dfix59Wrapped = true;

    console.log(TAG, 'hybrid extractor active (tag → legacy fallback)');

    // 既存ターンの再描画
    try {
      if (typeof dl.renderStream === 'function') dl.renderStream();
    } catch(e){
      console.warn(TAG, 're-render skipped:', e && e.message);
    }
  }

  tryWrap();
})();
