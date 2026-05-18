// =====================================================================
// Chronicle TRPG — v292Dfix60: display pipeline (tag stripping for narrative)
// ---------------------------------------------------------------------
// 目的:
//   fix58 で Hermes に <say who="..."> タグと <summary>...</summary> タグの使用を
//   指示したため、narrative テキストにこれらが含まれる。UI.renderNarr が
//   そのまま HTML エスケープすると画面に「<say who="ミリア">…</say>」が
//   生のまま(��示される。
//
//   fix60 では UI.renderNarr を wrap し、レンダリング前に：
//     - <summary>...</summary> ブロックを完全除去（fix58 parseExt の保険）
//     - <say who="X">text</say> を 「text」 に置換
//   して、既存の renderNarr が「」装飾を施した結果を返す。
//
// 副次効果:
//   - tag によるカラー化・スタイル分けの基盤として、後で <span class="dial-who-X">
//     のような DOM 出力に拡張可能（今は最小実装で「」置換のみ）
//
// 注意:
//   会話ログ（左パネル）の dialogue extractor は別経路（fix59 hybrid extractor
//   が拾うため）。fix60 は narrative 表示パネル（右パネル）専用。
// =====================================================================
(function(){
  if (window.__v292Dfix60Active) return;
  window.__v292Dfix60Active = true;
  var TAG = '[v292Dfix60]';

  function getUIRef(){
    try {
      var U = (0, eval)('typeof UI !== "undefined" ? UI : null');
      if (U) return U;
    } catch(e){}
    return window.UI || null;
  }

  // narrative テキストから tag を表示用に変換
  function stripTagsForDisplay(text){
    if (text == null) return text;
    var s = String(text);

    // 1. <summary>...</summary> を完全除去
    s = s.replace(/<summary>[\s\S]*?<\/summary>/g, '');
    // 閉じてない <summary> もあれば除去（保険）
    s = s.replace(/<summary>[\s\S]*$/g, '');

    // 2. <say who="..."> text </say> を 「text」 に置換
    //    内心モノローグ表記 who="X(心)" もそのまま処理（中身が （…）で囲まれてれば自然）
    s = s.replace(/<say\s+who="([^"]*)"\s*>([\s\S]*?)<\/say>/g, function(_, who, content){
      var t = String(content || '').trim();
      // 内心モノローグ: 既に （） で囲まれてればそのまま、なければ 「」 で囲む
      if (/^[\(（].*[\)）]$/.test(t)) return t;
      return '「' + t + '」';
    });

    // 3. 閉じてない <say> の最後の保険: 開始タグだけ → 「
    s = s.replace(/<say\s+who="[^"]*"\s*>/g, '「');
    s = s.replace(/<\/say>/g, '」');

    // 4. 周辺の空白整理（タグ前後の余分なスペース）
    s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');

    return s.trim();
  }

  function tryWrap(){
    var UI = getUIRef();
    if (!UI || typeof UI.renderNarr !== 'function'){
      setTimeout(tryWrap, 300);
      return;
    }
    if (UI.__v292Dfix60Wrapped) return;

    var orig = UI.renderNarr;
    UI.renderNarr = function(text){
      try {
        var processed = stripTagsForDisplay(text);
        return orig.call(this, processed);
      } catch(e){
        console.warn(TAG, 'wrap error:', e && e.message);
        return orig.call(this, text);
      }
    };
    UI.__v292Dfix60Wrapped = true;

    console.log(TAG, 'UI.renderNarr wrapped (tag → 「」 conversion active)');

    // 既存ターンの再描画
    try {
      if (typeof UI.renderAll === 'function') UI.renderAll();
    } catch(e){
      console.warn(TAG, 're-render skipped:', e && e.message);
    }
  }

  tryWrap();
})();
